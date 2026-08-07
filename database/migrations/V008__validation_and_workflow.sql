BEGIN;
SET search_path TO seguridad_vial, public;

CREATE OR REPLACE FUNCTION fn_usuario_tiene_rol(p_usuario_id uuid, p_codigo_rol varchar)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM usuario_rol ur
        JOIN rol r ON r.id = ur.rol_id
        WHERE ur.usuario_id = p_usuario_id
          AND r.codigo = p_codigo_rol
          AND r.estado = 'ACTIVO'
          AND current_date >= ur.fecha_desde
          AND (ur.fecha_hasta IS NULL OR current_date <= ur.fecha_hasta)
    );
$$;

CREATE OR REPLACE FUNCTION fn_validar_version(p_version_id uuid)
RETURNS TABLE (
    codigo varchar,
    severidad varchar,
    detalle text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 'SIN_MATERIALIZACION'::varchar, 'ERROR'::varchar,
           'La versión no tiene días materializados'::text
    WHERE NOT EXISTS (SELECT 1 FROM dia_cronograma WHERE version_id = p_version_id);

    RETURN QUERY
    SELECT 'HUECO_SIN_JUSTIFICAR'::varchar, 'ERROR'::varchar,
           format('Hueco sin motivo/responsable: %s móvil %s turno %s',
                  c.fecha_operativa, m.numero, c.turno)::text
    FROM cobertura_dia c
    JOIN movil m ON m.id = c.movil_id
    WHERE c.version_id = p_version_id
      AND c.estado = 'HUECO'
      AND (c.motivo_hueco IS NULL OR c.responsable_aceptacion_id IS NULL);

    RETURN QUERY
    SELECT 'ASIGNACION_DURANTE_NOVEDAD'::varchar, 'ERROR'::varchar,
           format('Inspector %s asignado durante una novedad el %s', i.nombre_completo, d.fecha_operativa)::text
    FROM dia_cronograma d
    JOIN inspector i ON i.id = d.inspector_asignado_id
    JOIN novedad_operativa n
      ON n.inspector_id = d.inspector_asignado_id
     AND n.estado IN ('APROBADA', 'CERRADA')
     AND d.fecha_operativa <@ n.periodo
    WHERE d.version_id = p_version_id
      AND d.tipo_dia = 'TRABAJO';

    RETURN QUERY
    SELECT 'VACACION_TRABAJOS_DEMANDA'::varchar, 'ERROR'::varchar,
           format('La vacación %s requiere %s trabajos a demanda y posee %s',
                  v.novedad_id, v.cantidad_trabajos_demanda, count(a.id))::text
    FROM vacacion_detalle v
    JOIN novedad_operativa n ON n.id = v.novedad_id
    LEFT JOIN ajuste_planificacion a
      ON a.novedad_id = v.novedad_id
     AND a.version_id = p_version_id
     AND a.tipo = 'TRABAJO_DEMANDA'
    WHERE n.version_registro_id = p_version_id
      AND n.estado IN ('APROBADA', 'CERRADA')
    GROUP BY v.novedad_id, v.cantidad_trabajos_demanda
    HAVING count(a.id) <> v.cantidad_trabajos_demanda;

    RETURN QUERY
    SELECT 'VACACION_FRANCO_POSTERIOR'::varchar, 'ERROR'::varchar,
           format('La vacación %s debe poseer un franco posterior', v.novedad_id)::text
    FROM vacacion_detalle v
    JOIN novedad_operativa n ON n.id = v.novedad_id
    WHERE n.version_registro_id = p_version_id
      AND n.estado IN ('APROBADA', 'CERRADA')
      AND NOT EXISTS (
          SELECT 1 FROM ajuste_planificacion a
          WHERE a.version_id = p_version_id
            AND a.novedad_id = v.novedad_id
            AND a.tipo = 'FRANCO_ADICIONAL'
      );
END;
$$;

CREATE OR REPLACE PROCEDURE sp_justificar_hueco(
    p_cobertura_id uuid,
    p_motivo text,
    p_usuario_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT (fn_usuario_tiene_rol(p_usuario_id, 'ADMINISTRACION_SEGURIDAD_VIAL')
            OR fn_usuario_tiene_rol(p_usuario_id, 'JEFE_SECTOR')) THEN
        RAISE EXCEPTION 'El usuario no puede justificar huecos';
    END IF;
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'El motivo es obligatorio';
    END IF;

    UPDATE cobertura_dia
    SET motivo_hueco = p_motivo,
        responsable_aceptacion_id = p_usuario_id,
        fecha_aceptacion = now()
    WHERE id = p_cobertura_id
      AND estado = 'HUECO';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró un hueco editable';
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_enviar_revision(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_estado estado_version;
BEGIN
    IF NOT fn_usuario_tiene_rol(p_usuario_id, 'ADMINISTRACION_SEGURIDAD_VIAL') THEN
        RAISE EXCEPTION 'Solo Administración de Seguridad Vial puede enviar a revisión';
    END IF;
    IF fn_capa_version(p_version_id) <> 'PLANIFICADA' THEN
        RAISE EXCEPTION 'El flujo de aprobación corresponde a PLANIFICADA';
    END IF;
    SELECT estado INTO v_estado FROM cronograma_version WHERE id = p_version_id FOR UPDATE;
    IF v_estado NOT IN ('BORRADOR', 'OBSERVADA') THEN
        RAISE EXCEPTION 'Estado inválido para enviar a revisión: %', v_estado;
    END IF;
    IF EXISTS (
        SELECT 1 FROM fn_validar_version(p_version_id)
        WHERE severidad = 'ERROR' AND codigo <> 'HUECO_SIN_JUSTIFICAR'
    ) THEN
        RAISE EXCEPTION 'La versión posee errores estructurales de validación';
    END IF;

    UPDATE cronograma_version
    SET estado = 'EN_REVISION',
        enviada_revision_por = p_usuario_id,
        enviada_revision_en = now()
    WHERE id = p_version_id;

    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
    VALUES (p_version_id, v_estado, 'EN_REVISION', p_usuario_id);
END;
$$;

CREATE OR REPLACE PROCEDURE sp_observar_version(
    p_version_id uuid,
    p_observacion text,
    p_usuario_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT fn_usuario_tiene_rol(p_usuario_id, 'JEFE_SECTOR') THEN
        RAISE EXCEPTION 'Solo el Jefe del sector puede observar';
    END IF;
    IF p_observacion IS NULL OR btrim(p_observacion) = '' THEN
        RAISE EXCEPTION 'La observación es obligatoria';
    END IF;

    UPDATE cronograma_version
    SET estado = 'OBSERVADA', observaciones_revision = p_observacion
    WHERE id = p_version_id AND estado = 'EN_REVISION';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La versión no está en revisión';
    END IF;

    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id, observacion)
    VALUES (p_version_id, 'EN_REVISION', 'OBSERVADA', p_usuario_id, p_observacion);
END;
$$;

CREATE OR REPLACE PROCEDURE sp_reabrir_observada(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT fn_usuario_tiene_rol(p_usuario_id, 'ADMINISTRACION_SEGURIDAD_VIAL') THEN
        RAISE EXCEPTION 'Solo Administración de Seguridad Vial puede reabrir';
    END IF;
    UPDATE cronograma_version SET estado = 'BORRADOR'
    WHERE id = p_version_id AND estado = 'OBSERVADA';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La versión no está observada';
    END IF;
    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
    VALUES (p_version_id, 'OBSERVADA', 'BORRADOR', p_usuario_id);
END;
$$;

CREATE OR REPLACE PROCEDURE sp_aprobar_publicar_version(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cronograma_id uuid;
    v_version_publicada uuid;
BEGIN
    IF NOT fn_usuario_tiene_rol(p_usuario_id, 'JEFE_SECTOR') THEN
        RAISE EXCEPTION 'Solo el Jefe del sector puede aprobar y publicar';
    END IF;
    IF fn_capa_version(p_version_id) <> 'PLANIFICADA' THEN
        RAISE EXCEPTION 'Solo una versión PLANIFICADA utiliza este flujo';
    END IF;

    SELECT cronograma_id INTO v_cronograma_id
    FROM cronograma_version
    WHERE id = p_version_id AND estado = 'EN_REVISION'
    FOR UPDATE;
    IF v_cronograma_id IS NULL THEN
        RAISE EXCEPTION 'La versión no está en revisión';
    END IF;

    IF EXISTS (
        SELECT 1 FROM cronograma_version
        WHERE id = p_version_id
          AND (creada_por = p_usuario_id OR enviada_revision_por = p_usuario_id)
    ) THEN
        RAISE EXCEPTION 'Separación de funciones: quien preparó o envió la versión no puede aprobarla';
    END IF;

    IF EXISTS (SELECT 1 FROM fn_validar_version(p_version_id) WHERE severidad = 'ERROR') THEN
        RAISE EXCEPTION 'La versión posee errores de validación';
    END IF;

    SELECT id INTO v_version_publicada
    FROM cronograma_version
    WHERE cronograma_id = v_cronograma_id
      AND estado = 'APROBADA_PUBLICADA'
    FOR UPDATE;

    IF v_version_publicada IS NOT NULL THEN
        UPDATE cronograma_version
        SET estado = 'REEMPLAZADA'
        WHERE id = v_version_publicada;
        INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
        VALUES (v_version_publicada, 'APROBADA_PUBLICADA', 'REEMPLAZADA', p_usuario_id);
    END IF;

    UPDATE cronograma_version
    SET estado = 'APROBADA_PUBLICADA',
        aprobada_publicada_por = p_usuario_id,
        aprobada_publicada_en = now()
    WHERE id = p_version_id;

    UPDATE cronograma SET version_actual_id = p_version_id WHERE id = v_cronograma_id;

    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
    VALUES (p_version_id, 'EN_REVISION', 'APROBADA_PUBLICADA', p_usuario_id);
END;
$$;

CREATE OR REPLACE PROCEDURE sp_cerrar_version(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT fn_usuario_tiene_rol(p_usuario_id, 'JEFE_SECTOR') THEN
        RAISE EXCEPTION 'Solo el Jefe del sector puede cerrar';
    END IF;
    IF fn_capa_version(p_version_id) = 'REAL' THEN
        UPDATE cronograma_version
        SET estado = 'CERRADA', cerrada_por = p_usuario_id, cerrada_en = now()
        WHERE id = p_version_id AND estado = 'BORRADOR';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La versión REAL no está abierta';
        END IF;
        INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
        VALUES (p_version_id, 'BORRADOR', 'CERRADA', p_usuario_id);
    ELSE
        UPDATE cronograma_version
        SET estado = 'CERRADA', cerrada_por = p_usuario_id, cerrada_en = now()
        WHERE id = p_version_id AND estado = 'APROBADA_PUBLICADA';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La versión no está publicada';
        END IF;
        INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
        VALUES (p_version_id, 'APROBADA_PUBLICADA', 'CERRADA', p_usuario_id);
    END IF;
END;
$$;

COMMIT;
