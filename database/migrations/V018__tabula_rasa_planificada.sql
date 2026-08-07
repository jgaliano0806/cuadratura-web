-- V018: tabula rasa de capas PLANIFICADA y aplicación de overlays operativos en REAL.
BEGIN;
SET search_path TO seguridad_vial, public;

CREATE OR REPLACE FUNCTION fn_no_eliminar_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_setting('app.plan_tabula_rasa', true) = 'on' THEN
        RETURN OLD;
    END IF;
    IF current_setting('app.initialization_reversal', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Las versiones no se eliminan; se reemplazan o cierran';
END;
$$;

CREATE OR REPLACE FUNCTION fn_exigir_version_editable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_version uuid;
BEGIN
    v_version := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
    IF current_setting('app.initialization_reversal', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    IF current_setting('app.plan_tabula_rasa', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    IF current_setting('app.materializing', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
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
        -- Permite materializar REAL desde borrador PLAN en el flujo del motor.
        IF current_setting('app.real_from_plan_draft', true) = 'on'
           AND v_capa = 'REAL'
           AND v_capa_origen = 'PLANIFICADA' THEN
            NULL;
        ELSIF v_estado_origen NOT IN ('APROBADA_PUBLICADA', 'CERRADA', 'REEMPLAZADA') THEN
            RAISE EXCEPTION 'La versión origen debe estar publicada o cerrada';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

/**
 * Elimina cronogramas/versiones de capa PLANIFICADA (días, cobertura, historial).
 * No toca BASE ni REAL. Habilita re-proyección limpia y, si corresponde, revertir init.
 */
CREATE OR REPLACE PROCEDURE sp_tabula_rasa_planificada(p_usuario_id uuid, p_motivo text)
LANGUAGE plpgsql
AS $$
DECLARE
    r record;
    v_count int := 0;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'El motivo de tabula rasa es obligatorio';
    END IF;
    IF NOT (
        fn_usuario_tiene_rol(p_usuario_id, 'ADMINISTRACION_SEGURIDAD_VIAL')
        OR fn_usuario_tiene_rol(p_usuario_id, 'ADMINISTRADOR_SISTEMA')
    ) THEN
        RAISE EXCEPTION 'Solo Administración SV o Admin sistema pueden ejecutar tabula rasa PLANIFICADA';
    END IF;

    PERFORM set_config('app.plan_tabula_rasa', 'on', true);
    PERFORM set_config('app.materializing', 'on', true);

    FOR r IN
        SELECT c.id AS cronograma_id, v.id AS version_id
        FROM cronograma c
        JOIN cronograma_version v ON v.cronograma_id = c.id
        WHERE c.capa = 'PLANIFICADA'
    LOOP
        DELETE FROM vacacion_detalle
        WHERE novedad_id IN (
            SELECT id FROM novedad_operativa WHERE version_registro_id = r.version_id
        );
        DELETE FROM reemplazo_novedad
        WHERE novedad_id IN (
            SELECT id FROM novedad_operativa WHERE version_registro_id = r.version_id
        );
        DELETE FROM novedad_operativa WHERE version_registro_id = r.version_id;

        DELETE FROM ajuste_planificacion WHERE version_id = r.version_id;
        DELETE FROM cobertura_dia WHERE version_id = r.version_id;
        DELETE FROM dia_cronograma WHERE version_id = r.version_id;
        DELETE FROM bloque_cuadratura WHERE version_id = r.version_id;
        DELETE FROM materializacion_ejecucion WHERE version_id = r.version_id;
        DELETE FROM version_estado_historial WHERE version_id = r.version_id;
        UPDATE cronograma SET version_actual_id = NULL WHERE id = r.cronograma_id;
        UPDATE cronograma_version
        SET derivada_de_version_id = NULL
        WHERE derivada_de_version_id = r.version_id;
        DELETE FROM cronograma_version WHERE id = r.version_id;
        v_count := v_count + 1;
    END LOOP;

    DELETE FROM cronograma WHERE capa = 'PLANIFICADA';

    PERFORM set_config('app.materializing', 'off', true);
    PERFORM set_config('app.plan_tabula_rasa', 'off', true);
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.materializing', 'off', true);
    PERFORM set_config('app.plan_tabula_rasa', 'off', true);
    RAISE;
END;
$$;

COMMENT ON PROCEDURE sp_tabula_rasa_planificada IS
'Borra toda la capa PLANIFICADA para regenerar proyección limpia (sin overlays operativos). La dupla Haro–Ramos se aplica en REAL vía asignacion_operativa.';

COMMIT;
