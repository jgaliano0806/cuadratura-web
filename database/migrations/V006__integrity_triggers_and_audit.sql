BEGIN;
SET search_path TO seguridad_vial, public;

CREATE OR REPLACE FUNCTION fn_capa_version(p_version_id uuid)
RETURNS tipo_capa
LANGUAGE sql
STABLE
AS $$
    SELECT c.capa
    FROM cronograma_version v
    JOIN cronograma c ON c.id = v.cronograma_id
    WHERE v.id = p_version_id;
$$;

CREATE OR REPLACE FUNCTION fn_version_editable(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT estado IN ('BORRADOR', 'OBSERVADA')
    FROM cronograma_version
    WHERE id = p_version_id;
$$;

CREATE OR REPLACE FUNCTION fn_exigir_version_editable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_version uuid;
BEGIN
    v_version := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
    IF NOT COALESCE(fn_version_editable(v_version), false) THEN
        RAISE EXCEPTION 'La versión % no es editable', v_version;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION fn_validar_derivacion_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_capa tipo_capa;
    v_capa_origen tipo_capa;
    v_estado_origen estado_version;
BEGIN
    SELECT capa INTO v_capa FROM cronograma WHERE id = NEW.cronograma_id;

    IF NEW.version_anterior_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM cronograma_version anterior
            WHERE anterior.id = NEW.version_anterior_id
              AND anterior.cronograma_id = NEW.cronograma_id
              AND anterior.numero_version < NEW.numero_version
        ) THEN
            RAISE EXCEPTION 'La versión anterior debe pertenecer al mismo cronograma y tener un número menor';
        END IF;
    END IF;

    IF v_capa = 'BASE' THEN
        IF NEW.derivada_de_version_id IS NOT NULL THEN
            RAISE EXCEPTION 'Una versión BASE no puede derivar de otra capa';
        END IF;
    ELSE
        IF NEW.derivada_de_version_id IS NULL THEN
            RAISE EXCEPTION 'Las versiones % requieren una versión origen', v_capa;
        END IF;
        SELECT fn_capa_version(NEW.derivada_de_version_id), estado
        INTO v_capa_origen, v_estado_origen
        FROM cronograma_version
        WHERE id = NEW.derivada_de_version_id;

        IF v_capa = 'PLANIFICADA' AND v_capa_origen <> 'BASE' THEN
            RAISE EXCEPTION 'PLANIFICADA debe derivar de BASE';
        END IF;
        IF v_capa = 'REAL' AND v_capa_origen <> 'PLANIFICADA' THEN
            RAISE EXCEPTION 'REAL debe derivar de PLANIFICADA';
        END IF;
        IF v_estado_origen NOT IN ('APROBADA_PUBLICADA', 'CERRADA', 'REEMPLAZADA') THEN
            RAISE EXCEPTION 'La versión origen debe estar publicada o cerrada';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_derivacion_version
BEFORE INSERT OR UPDATE OF derivada_de_version_id, version_anterior_id, cronograma_id, numero_version
ON cronograma_version
FOR EACH ROW EXECUTE FUNCTION fn_validar_derivacion_version();

CREATE OR REPLACE FUNCTION fn_validar_transicion_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.estado = OLD.estado THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.estado = 'BORRADOR' AND NEW.estado = 'EN_REVISION') OR
        (OLD.estado = 'BORRADOR' AND NEW.estado = 'CERRADA' AND fn_capa_version(OLD.id) = 'REAL') OR
        (OLD.estado = 'EN_REVISION' AND NEW.estado IN ('OBSERVADA', 'APROBADA_PUBLICADA')) OR
        (OLD.estado = 'OBSERVADA' AND NEW.estado IN ('BORRADOR', 'EN_REVISION')) OR
        (OLD.estado = 'APROBADA_PUBLICADA' AND NEW.estado IN ('REEMPLAZADA', 'CERRADA'))
    ) THEN
        RAISE EXCEPTION 'Transición de versión no permitida: % -> %', OLD.estado, NEW.estado;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_transicion_version
BEFORE UPDATE OF estado ON cronograma_version
FOR EACH ROW EXECUTE FUNCTION fn_validar_transicion_version();

CREATE OR REPLACE FUNCTION fn_no_eliminar_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Las versiones no se eliminan; se reemplazan o cierran';
END;
$$;

CREATE TRIGGER trg_no_eliminar_version
BEFORE DELETE ON cronograma_version
FOR EACH ROW EXECUTE FUNCTION fn_no_eliminar_version();

CREATE OR REPLACE FUNCTION fn_validar_capa_hijo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_capa tipo_capa;
BEGIN
    v_capa := fn_capa_version(NEW.version_id);
    IF TG_TABLE_NAME = 'bloque_cuadratura' AND v_capa <> 'BASE' THEN
        RAISE EXCEPTION 'Los bloques canónicos solo pertenecen a BASE';
    ELSIF TG_TABLE_NAME = 'ajuste_planificacion' AND v_capa <> 'PLANIFICADA' THEN
        RAISE EXCEPTION 'Los ajustes solo pertenecen a PLANIFICADA';
    ELSIF TG_TABLE_NAME = 'evento_real' AND v_capa <> 'REAL' THEN
        RAISE EXCEPTION 'Los eventos solo pertenecen a REAL';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bloque_capa
BEFORE INSERT OR UPDATE OF version_id ON bloque_cuadratura
FOR EACH ROW EXECUTE FUNCTION fn_validar_capa_hijo();

CREATE TRIGGER trg_ajuste_capa
BEFORE INSERT OR UPDATE OF version_id ON ajuste_planificacion
FOR EACH ROW EXECUTE FUNCTION fn_validar_capa_hijo();

CREATE TRIGGER trg_evento_capa
BEFORE INSERT OR UPDATE OF version_id ON evento_real
FOR EACH ROW EXECUTE FUNCTION fn_validar_capa_hijo();

CREATE OR REPLACE FUNCTION fn_validar_dia_asignable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer;
    v_fecha_alta date;
    v_fecha_baja date;
    v_estado_inspector estado_registro;
    v_estado_movil varchar(30);
    v_desde_movil date;
    v_hasta_movil date;
BEGIN
    IF NEW.tipo_dia = 'TRABAJO' THEN
        SELECT fecha_alta, fecha_baja, estado
        INTO v_fecha_alta, v_fecha_baja, v_estado_inspector
        FROM inspector WHERE id = NEW.inspector_asignado_id;

        IF v_estado_inspector <> 'ACTIVO'
           OR NEW.fecha_operativa < v_fecha_alta
           OR (v_fecha_baja IS NOT NULL AND NEW.fecha_operativa > v_fecha_baja) THEN
            RAISE EXCEPTION 'Inspector no disponible en %', NEW.fecha_operativa;
        END IF;

        SELECT estado, vigencia_desde, vigencia_hasta
        INTO v_estado_movil, v_desde_movil, v_hasta_movil
        FROM movil WHERE id = NEW.movil_id;

        IF v_estado_movil <> 'ACTIVO'
           OR NEW.fecha_operativa < v_desde_movil
           OR (v_hasta_movil IS NOT NULL AND NEW.fecha_operativa > v_hasta_movil) THEN
            RAISE EXCEPTION 'Móvil no disponible en %', NEW.fecha_operativa;
        END IF;

        IF current_setting('app.materializing', true) IS DISTINCT FROM 'on'
           AND EXISTS (
            SELECT 1
            FROM novedad_operativa n
            WHERE n.inspector_id = NEW.inspector_asignado_id
              AND n.estado IN ('APROBADA', 'CERRADA')
              AND NEW.fecha_operativa <@ n.periodo
        ) THEN
            RAISE EXCEPTION 'El inspector posee una novedad vigente en %', NEW.fecha_operativa;
        END IF;

        SELECT count(*) INTO v_count
        FROM dia_cronograma d
        WHERE d.version_id = NEW.version_id
          AND d.fecha_operativa = NEW.fecha_operativa
          AND d.movil_id = NEW.movil_id
          AND d.turno = NEW.turno
          AND d.tipo_dia = 'TRABAJO'
          AND d.inspector_asignado_id IS NOT NULL
          AND d.id <> NEW.id;

        IF v_count >= 2 THEN
            RAISE EXCEPTION 'Capacidad máxima de dos inspectores superada';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_dia_asignable
BEFORE INSERT OR UPDATE ON dia_cronograma
FOR EACH ROW EXECUTE FUNCTION fn_validar_dia_asignable();


CREATE OR REPLACE FUNCTION fn_validar_capa_novedad()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_capa tipo_capa;
BEGIN
    IF NEW.version_registro_id IS NOT NULL THEN
        v_capa := fn_capa_version(NEW.version_registro_id);
        IF v_capa <> NEW.capa_aplicacion THEN
            RAISE EXCEPTION 'La capa de la novedad no coincide con la versión asociada';
        END IF;
        IF v_capa = 'BASE' THEN
            RAISE EXCEPTION 'Las novedades no se aplican a BASE';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_capa_novedad
BEFORE INSERT OR UPDATE OF version_registro_id, capa_aplicacion
ON novedad_operativa
FOR EACH ROW EXECUTE FUNCTION fn_validar_capa_novedad();

CREATE OR REPLACE FUNCTION fn_validar_vacacion_detalle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_tipo tipo_novedad;
    v_desde date;
    v_hasta date;
BEGIN
    SELECT tipo, fecha_desde, fecha_hasta
    INTO v_tipo, v_desde, v_hasta
    FROM novedad_operativa WHERE id = NEW.novedad_id;

    IF v_tipo <> 'VACACION' THEN
        RAISE EXCEPTION 'vacacion_detalle requiere una novedad VACACION';
    END IF;
    IF v_hasta <> v_desde + (NEW.cantidad_dias - 1) THEN
        RAISE EXCEPTION 'El rango de vacaciones no coincide con % días corridos', NEW.cantidad_dias;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_vacacion_detalle
BEFORE INSERT OR UPDATE ON vacacion_detalle
FOR EACH ROW EXECUTE FUNCTION fn_validar_vacacion_detalle();

CREATE OR REPLACE FUNCTION fn_evento_real_inmutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Los eventos reales son append-only; registre una corrección nueva';
END;
$$;

CREATE TRIGGER trg_evento_real_inmutable
BEFORE UPDATE OR DELETE ON evento_real
FOR EACH ROW EXECUTE FUNCTION fn_evento_real_inmutable();

CREATE TRIGGER trg_bloque_version_editable
BEFORE INSERT OR UPDATE OR DELETE ON bloque_cuadratura
FOR EACH ROW EXECUTE FUNCTION fn_exigir_version_editable();

CREATE TRIGGER trg_dia_version_editable
BEFORE INSERT OR UPDATE OR DELETE ON dia_cronograma
FOR EACH ROW EXECUTE FUNCTION fn_exigir_version_editable();

CREATE TRIGGER trg_cobertura_version_editable
BEFORE INSERT OR UPDATE OR DELETE ON cobertura_dia
FOR EACH ROW EXECUTE FUNCTION fn_exigir_version_editable();

CREATE TRIGGER trg_ajuste_version_editable
BEFORE INSERT OR UPDATE OR DELETE ON ajuste_planificacion
FOR EACH ROW EXECUTE FUNCTION fn_exigir_version_editable();

CREATE TRIGGER trg_audit_version
AFTER INSERT OR UPDATE ON cronograma_version
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_posicion
AFTER INSERT OR UPDATE OR DELETE ON posicion_cuadratura
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_asignacion_posicion
AFTER INSERT OR UPDATE OR DELETE ON asignacion_inspector_posicion
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_novedad
AFTER INSERT OR UPDATE OR DELETE ON novedad_operativa
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_ajuste
AFTER INSERT OR UPDATE OR DELETE ON ajuste_planificacion
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_cobertura
AFTER UPDATE OF motivo_hueco, responsable_aceptacion_id, fecha_aceptacion ON cobertura_dia
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_inicializacion
AFTER INSERT OR UPDATE ON inicializacion_sistema
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();

COMMIT;
