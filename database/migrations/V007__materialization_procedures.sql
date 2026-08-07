BEGIN;
SET search_path TO seguridad_vial, public;

CREATE OR REPLACE FUNCTION fn_codigo_dia(
    p_tipo tipo_dia,
    p_turno turno_codigo,
    p_numero_movil smallint
)
RETURNS varchar
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_tipo
        WHEN 'TRABAJO' THEN p_turno::text || p_numero_movil::text
        WHEN 'FRANCO' THEN 'F'
        WHEN 'VACACION' THEN 'V'
        WHEN 'ENFERMEDAD' THEN 'EF'
        WHEN 'LICENCIA' THEN 'LIC'
        WHEN 'HUECO' THEN 'H'
    END::varchar;
$$;

CREATE OR REPLACE PROCEDURE sp_refrescar_cobertura(p_version_id uuid)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT fn_version_editable(p_version_id) THEN
        RAISE EXCEPTION 'La versión no es editable';
    END IF;

    INSERT INTO cobertura_dia (
        version_id, fecha_operativa, movil_id, turno,
        cantidad_objetivo, capacidad_maxima, cantidad_asignada,
        estado, alerta_activa
    )
    SELECT
        p_version_id,
        f.fecha::date,
        m.id,
        t.turno,
        1,
        2,
        COALESCE(a.cantidad, 0)::smallint,
        CASE COALESCE(a.cantidad, 0)
            WHEN 0 THEN 'HUECO'::estado_cobertura
            WHEN 1 THEN 'CUBIERTA'::estado_cobertura
            ELSE 'REFORZADA'::estado_cobertura
        END,
        COALESCE(a.cantidad, 0) = 0
    FROM cronograma_version v
    JOIN cronograma c ON c.id = v.cronograma_id
    CROSS JOIN LATERAL generate_series(c.periodo_desde, c.periodo_hasta, interval '1 day') f(fecha)
    JOIN movil m
      ON m.estado = 'ACTIVO'
     AND f.fecha::date >= m.vigencia_desde
     AND (m.vigencia_hasta IS NULL OR f.fecha::date <= m.vigencia_hasta)
    CROSS JOIN (VALUES ('M'::turno_codigo), ('T'::turno_codigo), ('N'::turno_codigo)) t(turno)
    LEFT JOIN LATERAL (
        SELECT count(*)::integer AS cantidad
        FROM dia_cronograma d
        WHERE d.version_id = p_version_id
          AND d.fecha_operativa = f.fecha::date
          AND d.movil_id = m.id
          AND d.turno = t.turno
          AND d.tipo_dia = 'TRABAJO'
          AND d.inspector_asignado_id IS NOT NULL
    ) a ON true
    WHERE v.id = p_version_id
    ON CONFLICT (version_id, fecha_operativa, movil_id, turno)
    DO UPDATE SET
        cantidad_asignada = EXCLUDED.cantidad_asignada,
        estado = EXCLUDED.estado,
        alerta_activa = EXCLUDED.alerta_activa,
        motivo_hueco = CASE WHEN EXCLUDED.estado = 'HUECO' THEN cobertura_dia.motivo_hueco ELSE NULL END,
        responsable_aceptacion_id = CASE WHEN EXCLUDED.estado = 'HUECO' THEN cobertura_dia.responsable_aceptacion_id ELSE NULL END,
        fecha_aceptacion = CASE WHEN EXCLUDED.estado = 'HUECO' THEN cobertura_dia.fecha_aceptacion ELSE NULL END;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_materializar_base(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ejecucion uuid;
    v_filas integer;
BEGIN
    IF fn_capa_version(p_version_id) <> 'BASE' THEN
        RAISE EXCEPTION 'La versión no pertenece a BASE';
    END IF;
    IF NOT fn_version_editable(p_version_id) THEN
        RAISE EXCEPTION 'La versión no es editable';
    END IF;

    PERFORM set_config('app.materializing', 'on', true);

    INSERT INTO materializacion_ejecucion(version_id, ejecutada_por)
    VALUES (p_version_id, p_usuario_id)
    RETURNING id INTO v_ejecucion;

    DELETE FROM cobertura_dia WHERE version_id = p_version_id;
    DELETE FROM dia_cronograma WHERE version_id = p_version_id;

    INSERT INTO dia_cronograma (
        version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        origen, bloque_id
    )
    SELECT
        b.version_id,
        gs.fecha::date,
        b.posicion_id,
        b.inspector_titular_id,
        CASE WHEN b.tipo = 'TRABAJO' THEN b.inspector_titular_id END,
        CASE WHEN b.tipo = 'TRABAJO' THEN 'TRABAJO'::tipo_dia ELSE 'FRANCO'::tipo_dia END,
        b.turno,
        b.movil_id,
        CASE WHEN b.tipo = 'TRABAJO'
             THEN fn_codigo_dia('TRABAJO', b.turno, m.numero)
             ELSE 'F'
        END,
        b.origen,
        b.id
    FROM bloque_cuadratura b
    CROSS JOIN LATERAL generate_series(b.fecha_desde, b.fecha_hasta, interval '1 day') gs(fecha)
    LEFT JOIN movil m ON m.id = b.movil_id
    WHERE b.version_id = p_version_id;

    GET DIAGNOSTICS v_filas = ROW_COUNT;
    CALL sp_refrescar_cobertura(p_version_id);

    PERFORM set_config('app.materializing', 'off', true);

    UPDATE materializacion_ejecucion
    SET estado = 'COMPLETADA', finalizada_en = now(), filas_generadas = v_filas
    WHERE id = v_ejecucion;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.materializing', 'off', true);
    IF v_ejecucion IS NOT NULL THEN
        UPDATE materializacion_ejecucion
        SET estado = 'FALLIDA', finalizada_en = now(), detalle_error = SQLERRM
        WHERE id = v_ejecucion;
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_materializar_planificada(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_origen uuid;
    v_ejecucion uuid;
    v_filas integer;
    a ajuste_planificacion%ROWTYPE;
    v_tipo_novedad tipo_novedad;
    v_tipo_resultante tipo_dia;
    v_codigo varchar(12);
    v_numero smallint;
BEGIN
    IF fn_capa_version(p_version_id) <> 'PLANIFICADA' THEN
        RAISE EXCEPTION 'La versión no pertenece a PLANIFICADA';
    END IF;
    IF NOT fn_version_editable(p_version_id) THEN
        RAISE EXCEPTION 'La versión no es editable';
    END IF;

    SELECT derivada_de_version_id INTO v_origen
    FROM cronograma_version WHERE id = p_version_id;

    PERFORM set_config('app.materializing', 'on', true);

    INSERT INTO materializacion_ejecucion(version_id, ejecutada_por)
    VALUES (p_version_id, p_usuario_id)
    RETURNING id INTO v_ejecucion;

    DELETE FROM cobertura_dia WHERE version_id = p_version_id;
    DELETE FROM dia_cronograma WHERE version_id = p_version_id;

    INSERT INTO dia_cronograma (
        version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        origen, dia_origen_id, bloque_id
    )
    SELECT
        p_version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        'GENERADO', id, bloque_id
    FROM dia_cronograma
    WHERE version_id = v_origen;

    FOR a IN
        WITH RECURSIVE cadena AS (
            SELECT id, version_anterior_id, 0 AS profundidad
            FROM cronograma_version WHERE id = p_version_id
            UNION ALL
            SELECT v.id, v.version_anterior_id, c.profundidad + 1
            FROM cronograma_version v
            JOIN cadena c ON c.version_anterior_id = v.id
        )
        SELECT a.*
        FROM cadena c
        JOIN ajuste_planificacion a ON a.version_id = c.id
        WHERE NOT EXISTS (
            SELECT 1
            FROM cadena c2
            JOIN ajuste_planificacion reemplazo ON reemplazo.version_id = c2.id
            WHERE reemplazo.ajuste_reemplazado_id = a.id
        )
        ORDER BY c.profundidad DESC, a.prioridad, a.creado_en, a.id
    LOOP
        IF a.tipo = 'APLICAR_NOVEDAD' THEN
            SELECT tipo INTO v_tipo_novedad
            FROM novedad_operativa
            WHERE id = a.novedad_id AND estado IN ('APROBADA', 'CERRADA');

            IF v_tipo_novedad IS NULL THEN
                RAISE EXCEPTION 'Ajuste % requiere una novedad aprobada', a.id;
            END IF;

            v_tipo_resultante := CASE v_tipo_novedad
                WHEN 'VACACION' THEN 'VACACION'::tipo_dia
                WHEN 'LICENCIA' THEN 'LICENCIA'::tipo_dia
                WHEN 'ENFERMEDAD' THEN 'ENFERMEDAD'::tipo_dia
            END;

            UPDATE dia_cronograma d
            SET tipo_dia = v_tipo_resultante,
                inspector_asignado_id = NULL,
                turno = NULL,
                movil_id = NULL,
                codigo = fn_codigo_dia(v_tipo_resultante, NULL, NULL),
                origen = 'NOVEDAD',
                novedad_id = a.novedad_id,
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);

        ELSIF a.tipo = 'TRABAJO_DEMANDA' THEN
            SELECT numero INTO v_numero FROM movil WHERE id = a.movil_resultante_id;
            UPDATE dia_cronograma d
            SET tipo_dia = 'TRABAJO',
                inspector_asignado_id = COALESCE(a.inspector_asignado_id, d.inspector_titular_id),
                turno = a.turno_resultante,
                movil_id = a.movil_resultante_id,
                codigo = fn_codigo_dia('TRABAJO', a.turno_resultante, v_numero),
                origen = 'NOVEDAD',
                novedad_id = a.novedad_id,
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);

        ELSIF a.tipo = 'FRANCO_ADICIONAL' THEN
            UPDATE dia_cronograma d
            SET tipo_dia = 'FRANCO',
                inspector_asignado_id = NULL,
                turno = NULL,
                movil_id = NULL,
                codigo = 'F',
                origen = 'NOVEDAD',
                novedad_id = a.novedad_id,
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);

        ELSIF a.tipo = 'REEMPLAZO' THEN
            UPDATE dia_cronograma d
            SET inspector_asignado_id = a.inspector_asignado_id,
                origen = 'NOVEDAD',
                novedad_id = a.novedad_id,
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.tipo_dia = 'TRABAJO'
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);

        ELSIF a.tipo = 'HUECO_ACEPTADO' THEN
            UPDATE dia_cronograma d
            SET tipo_dia = 'HUECO',
                inspector_asignado_id = NULL,
                turno = COALESCE(a.turno_resultante, d.turno),
                movil_id = COALESCE(a.movil_resultante_id, d.movil_id),
                codigo = 'H',
                origen = 'MANUAL',
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);

        ELSIF a.tipo = 'CAMBIO_MANUAL' THEN
            v_tipo_resultante := COALESCE(a.tipo_dia_resultante, 'TRABAJO');
            IF a.movil_resultante_id IS NOT NULL THEN
                SELECT numero INTO v_numero FROM movil WHERE id = a.movil_resultante_id;
            ELSE
                v_numero := NULL;
            END IF;
            v_codigo := COALESCE(
                a.codigo_resultante,
                fn_codigo_dia(v_tipo_resultante, a.turno_resultante, v_numero)
            );
            UPDATE dia_cronograma d
            SET tipo_dia = v_tipo_resultante,
                inspector_asignado_id = CASE
                    WHEN v_tipo_resultante = 'TRABAJO' THEN COALESCE(a.inspector_asignado_id, d.inspector_asignado_id, d.inspector_titular_id)
                    ELSE NULL
                END,
                turno = CASE WHEN v_tipo_resultante IN ('TRABAJO', 'HUECO') THEN COALESCE(a.turno_resultante, d.turno) END,
                movil_id = CASE WHEN v_tipo_resultante IN ('TRABAJO', 'HUECO') THEN COALESCE(a.movil_resultante_id, d.movil_id) END,
                codigo = v_codigo,
                origen = 'MANUAL',
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);
        END IF;
    END LOOP;

    SELECT count(*) INTO v_filas FROM dia_cronograma WHERE version_id = p_version_id;
    CALL sp_refrescar_cobertura(p_version_id);

    PERFORM set_config('app.materializing', 'off', true);

    UPDATE materializacion_ejecucion
    SET estado = 'COMPLETADA', finalizada_en = now(), filas_generadas = v_filas
    WHERE id = v_ejecucion;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.materializing', 'off', true);
    IF v_ejecucion IS NOT NULL THEN
        UPDATE materializacion_ejecucion
        SET estado = 'FALLIDA', finalizada_en = now(), detalle_error = SQLERRM
        WHERE id = v_ejecucion;
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_materializar_real(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_origen uuid;
    v_ejecucion uuid;
    v_filas integer;
    e evento_real%ROWTYPE;
    v_tipo_novedad tipo_novedad;
    v_tipo_resultante tipo_dia;
    v_numero smallint;
BEGIN
    IF fn_capa_version(p_version_id) <> 'REAL' THEN
        RAISE EXCEPTION 'La versión no pertenece a REAL';
    END IF;
    IF NOT fn_version_editable(p_version_id) THEN
        RAISE EXCEPTION 'La versión no es editable';
    END IF;

    SELECT derivada_de_version_id INTO v_origen
    FROM cronograma_version WHERE id = p_version_id;

    PERFORM set_config('app.materializing', 'on', true);

    INSERT INTO materializacion_ejecucion(version_id, ejecutada_por)
    VALUES (p_version_id, p_usuario_id)
    RETURNING id INTO v_ejecucion;

    DELETE FROM cobertura_dia WHERE version_id = p_version_id;
    DELETE FROM dia_cronograma WHERE version_id = p_version_id;

    INSERT INTO dia_cronograma (
        version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        origen, dia_origen_id, bloque_id
    )
    SELECT
        p_version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        'REAL', id, bloque_id
    FROM dia_cronograma
    WHERE version_id = v_origen;

    FOR e IN
        WITH RECURSIVE cadena AS (
            SELECT id, version_anterior_id, 0 AS profundidad
            FROM cronograma_version WHERE id = p_version_id
            UNION ALL
            SELECT v.id, v.version_anterior_id, c.profundidad + 1
            FROM cronograma_version v
            JOIN cadena c ON c.version_anterior_id = v.id
        )
        SELECT e.*
        FROM cadena c
        JOIN evento_real e ON e.version_id = c.id
        WHERE NOT EXISTS (
            SELECT 1
            FROM cadena c2
            JOIN evento_real reemplazo ON reemplazo.version_id = c2.id
            WHERE reemplazo.evento_reemplazado_id = e.id
        )
        ORDER BY c.profundidad DESC, e.creado_en, e.id
    LOOP
        IF e.tipo = 'CONFIRMACION_PLAN' THEN
            UPDATE dia_cronograma d
            SET evento_real_id = e.id,
                observacion = e.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa = e.fecha_operativa
              AND d.posicion_id = e.posicion_id;

        ELSIF e.tipo = 'AUSENCIA' THEN
            SELECT tipo INTO v_tipo_novedad FROM novedad_operativa WHERE id = e.novedad_id;
            v_tipo_resultante := CASE v_tipo_novedad
                WHEN 'VACACION' THEN 'VACACION'::tipo_dia
                WHEN 'LICENCIA' THEN 'LICENCIA'::tipo_dia
                ELSE 'ENFERMEDAD'::tipo_dia
            END;
            UPDATE dia_cronograma d
            SET tipo_dia = v_tipo_resultante,
                inspector_asignado_id = NULL,
                turno = NULL,
                movil_id = NULL,
                codigo = fn_codigo_dia(v_tipo_resultante, NULL, NULL),
                novedad_id = e.novedad_id,
                evento_real_id = e.id,
                observacion = e.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa = e.fecha_operativa
              AND d.posicion_id = e.posicion_id;

        ELSIF e.tipo = 'REEMPLAZO' THEN
            UPDATE dia_cronograma d
            SET tipo_dia = 'TRABAJO',
                inspector_asignado_id = e.inspector_asignado_id,
                turno = COALESCE(e.turno_resultante, d.turno),
                movil_id = COALESCE(e.movil_resultante_id, d.movil_id),
                codigo = COALESCE(e.codigo_resultante, d.codigo),
                novedad_id = e.novedad_id,
                evento_real_id = e.id,
                observacion = e.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa = e.fecha_operativa
              AND d.posicion_id = e.posicion_id;

        ELSIF e.tipo = 'HUECO' THEN
            UPDATE dia_cronograma d
            SET tipo_dia = 'HUECO',
                inspector_asignado_id = NULL,
                turno = COALESCE(e.turno_resultante, d.turno),
                movil_id = COALESCE(e.movil_resultante_id, d.movil_id),
                codigo = 'H',
                novedad_id = e.novedad_id,
                evento_real_id = e.id,
                observacion = e.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa = e.fecha_operativa
              AND d.posicion_id = e.posicion_id;

        ELSE
            IF e.movil_resultante_id IS NOT NULL THEN
                SELECT numero INTO v_numero FROM movil WHERE id = e.movil_resultante_id;
            ELSE
                v_numero := NULL;
            END IF;
            v_tipo_resultante := COALESCE(e.tipo_dia_resultante, 'TRABAJO');
            UPDATE dia_cronograma d
            SET tipo_dia = v_tipo_resultante,
                inspector_asignado_id = CASE
                    WHEN v_tipo_resultante = 'TRABAJO' THEN COALESCE(e.inspector_asignado_id, d.inspector_asignado_id)
                    ELSE NULL
                END,
                turno = CASE WHEN v_tipo_resultante IN ('TRABAJO', 'HUECO') THEN COALESCE(e.turno_resultante, d.turno) END,
                movil_id = CASE WHEN v_tipo_resultante IN ('TRABAJO', 'HUECO') THEN COALESCE(e.movil_resultante_id, d.movil_id) END,
                codigo = COALESCE(e.codigo_resultante, fn_codigo_dia(v_tipo_resultante, e.turno_resultante, v_numero), d.codigo),
                novedad_id = e.novedad_id,
                evento_real_id = e.id,
                observacion = e.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa = e.fecha_operativa
              AND d.posicion_id = e.posicion_id;
        END IF;
    END LOOP;

    SELECT count(*) INTO v_filas FROM dia_cronograma WHERE version_id = p_version_id;
    CALL sp_refrescar_cobertura(p_version_id);

    PERFORM set_config('app.materializing', 'off', true);

    UPDATE materializacion_ejecucion
    SET estado = 'COMPLETADA', finalizada_en = now(), filas_generadas = v_filas
    WHERE id = v_ejecucion;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.materializing', 'off', true);
    IF v_ejecucion IS NOT NULL THEN
        UPDATE materializacion_ejecucion
        SET estado = 'FALLIDA', finalizada_en = now(), detalle_error = SQLERRM
        WHERE id = v_ejecucion;
    END IF;
    RAISE;
END;
$$;

COMMIT;
