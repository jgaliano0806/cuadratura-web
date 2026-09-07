BEGIN;
SET search_path TO seguridad_vial, public;

-- Real puede quedar con 3 TRABAJO en el mismo móvil/turno un día (overlay).
-- cobertura_dia solo admite 0..2; sin el tope, sp_refrescar_cobertura tira 500.

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
        LEAST(COALESCE(a.cantidad, 0), 2)::smallint,
        CASE LEAST(COALESCE(a.cantidad, 0), 2)
            WHEN 0 THEN 'HUECO'::estado_cobertura
            WHEN 1 THEN 'CUBIERTA'::estado_cobertura
            ELSE 'REFORZADA'::estado_cobertura
        END,
        LEAST(COALESCE(a.cantidad, 0), 2) = 0
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

COMMIT;
