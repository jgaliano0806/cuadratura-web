-- V016: materializar V/EF en la cuadratura + titular en francos
BEGIN;

CREATE OR REPLACE PROCEDURE sp_materializar_base(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ejecucion uuid;
    v_filas integer;
    v_inicializacion_id uuid;
BEGIN
    IF fn_capa_version(p_version_id) <> 'BASE' THEN
        RAISE EXCEPTION 'La versión no pertenece a BASE';
    END IF;
    IF NOT fn_version_editable(p_version_id) THEN
        RAISE EXCEPTION 'La versión no es editable';
    END IF;

    SELECT c.inicializacion_id INTO v_inicializacion_id
    FROM cronograma_version v
    JOIN cronograma c ON c.id = v.cronograma_id
    WHERE v.id = p_version_id;

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
        COALESCE(
          b.inspector_titular_id,
          (
            SELECT a.inspector_id
            FROM asignacion_inspector_posicion a
            WHERE a.posicion_id = b.posicion_id
              AND gs.fecha::date >= a.fecha_desde
              AND (a.fecha_hasta IS NULL OR gs.fecha::date <= a.fecha_hasta)
            ORDER BY a.fecha_desde DESC
            LIMIT 1
          )
        ) AS inspector_titular_id,
        CASE WHEN b.tipo = 'TRABAJO' THEN COALESCE(
          b.inspector_titular_id,
          (
            SELECT a.inspector_id
            FROM asignacion_inspector_posicion a
            WHERE a.posicion_id = b.posicion_id
              AND gs.fecha::date >= a.fecha_desde
              AND (a.fecha_hasta IS NULL OR gs.fecha::date <= a.fecha_hasta)
            ORDER BY a.fecha_desde DESC
            LIMIT 1
          )
        ) END,
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

    -- Vacaciones / enfermedad del Excel (no entran en bloques 5x2/3)
    INSERT INTO dia_cronograma (
        version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        origen
    )
    SELECT
        p_version_id,
        d.fecha_operativa,
        p.id,
        i.id,
        NULL,
        d.tipo_dia,
        NULL,
        NULL,
        d.codigo_normalizado,
        'IMPORTADO'::origen_registro
    FROM inicializacion_dia_staging d
    JOIN inicializacion_inspector_staging s
      ON s.inicializacion_id = d.inicializacion_id AND s.ordinal = d.ordinal
    JOIN posicion_cuadratura p ON p.codigo = s.posicion_codigo
    JOIN inspector i ON i.legajo = s.legajo
    WHERE d.inicializacion_id = v_inicializacion_id
      AND d.tipo_dia IN ('VACACION'::tipo_dia, 'ENFERMEDAD'::tipo_dia)
      AND NOT EXISTS (
          SELECT 1 FROM dia_cronograma x
          WHERE x.version_id = p_version_id
            AND x.posicion_id = p.id
            AND x.fecha_operativa = d.fecha_operativa
      );

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

-- Backfill de la versión BASE ya publicada
DO $$
DECLARE
    v_version_id uuid;
BEGIN
    SELECT c.version_actual_id INTO v_version_id
    FROM cronograma c
    JOIN inicializacion_sistema i ON i.id = c.inicializacion_id
    WHERE i.es_activa
    ORDER BY c.creado_en DESC
    LIMIT 1;

    IF v_version_id IS NULL THEN
        RETURN;
    END IF;

    -- Permite corregir BASE publicada (misma vía que reversión extraordinaria)
    PERFORM set_config('app.initialization_reversal', 'on', true);
    PERFORM set_config('app.materializing', 'on', true);

    UPDATE dia_cronograma d
    SET inspector_titular_id = a.inspector_id
    FROM asignacion_inspector_posicion a
    WHERE d.version_id = v_version_id
      AND a.posicion_id = d.posicion_id
      AND d.fecha_operativa >= a.fecha_desde
      AND (a.fecha_hasta IS NULL OR d.fecha_operativa <= a.fecha_hasta)
      AND d.inspector_titular_id IS NULL;

    UPDATE bloque_cuadratura b
    SET inspector_titular_id = a.inspector_id
    FROM asignacion_inspector_posicion a
    WHERE b.version_id = v_version_id
      AND a.posicion_id = b.posicion_id
      AND b.fecha_desde >= a.fecha_desde
      AND (a.fecha_hasta IS NULL OR b.fecha_desde <= a.fecha_hasta)
      AND b.inspector_titular_id IS NULL;

    INSERT INTO dia_cronograma (
        version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        origen
    )
    SELECT
        v_version_id,
        g.fecha_operativa,
        g.posicion_id,
        g.inspector_id,
        NULL,
        g.tipo_dia_esperado,
        NULL,
        NULL,
        g.codigo_esperado,
        'IMPORTADO'::origen_registro
    FROM registro_golden_master g
    JOIN cronograma_version v ON v.id = v_version_id
    JOIN cronograma c ON c.id = v.cronograma_id
    WHERE g.inicializacion_id = c.inicializacion_id
      AND g.tipo_dia_esperado IN ('VACACION'::tipo_dia, 'ENFERMEDAD'::tipo_dia)
      AND NOT EXISTS (
          SELECT 1
          FROM dia_cronograma d
          WHERE d.version_id = v_version_id
            AND d.posicion_id = g.posicion_id
            AND d.fecha_operativa = g.fecha_operativa
      );

    -- Cobertura de móviles no cambia con V/EF; evitar sp_refrescar_cobertura
    -- (exige versión editable). Solo se actualiza en materializaciones normales.

    PERFORM set_config('app.materializing', 'off', true);
    PERFORM set_config('app.initialization_reversal', 'off', true);
END $$;

COMMIT;
