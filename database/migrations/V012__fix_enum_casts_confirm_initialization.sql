BEGIN;
SET search_path TO seguridad_vial, public;

-- Corrige casts de literales a enums en INSERT...SELECT de la confirmación.
-- En PostgreSQL, un literal en SELECT se tipa como text y no se asigna a
-- columnas enum sin cast explícito (error 42804).

CREATE OR REPLACE PROCEDURE sp_confirmar_inicializacion(
    p_inicializacion_id uuid,
    p_usuario_id uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_estado estado_inicializacion;
    v_hash char(64);
    v_desde date;
    v_hasta date;
    v_cronograma_id uuid;
    v_version_id uuid;
BEGIN
    SELECT estado, hash_sha256 INTO v_estado, v_hash
    FROM inicializacion_sistema
    WHERE id = p_inicializacion_id
    FOR UPDATE;

    IF v_estado <> 'VALIDADA' THEN
        RAISE EXCEPTION 'La inicialización debe estar VALIDADA; estado actual: %', v_estado;
    END IF;
    IF EXISTS (SELECT 1 FROM inicializacion_sistema WHERE es_activa AND id <> p_inicializacion_id) THEN
        RAISE EXCEPTION 'Ya existe una inicialización activa';
    END IF;
    IF EXISTS (SELECT 1 FROM error_inicializacion WHERE inicializacion_id = p_inicializacion_id AND severidad = 'ERROR') THEN
        RAISE EXCEPTION 'La inicialización posee errores bloqueantes';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM inicializacion_inspector_staging WHERE inicializacion_id = p_inicializacion_id) THEN
        RAISE EXCEPTION 'No hay inspectores en staging';
    END IF;

    SELECT min(fecha_operativa), max(fecha_operativa)
    INTO v_desde, v_hasta
    FROM inicializacion_dia_staging
    WHERE inicializacion_id = p_inicializacion_id;

    INSERT INTO inspector(legajo, nombre_completo, fecha_alta, inicializacion_id)
    SELECT legajo, nombre_normalizado, v_desde, p_inicializacion_id
    FROM inicializacion_inspector_staging
    WHERE inicializacion_id = p_inicializacion_id
    ON CONFLICT (legajo) DO UPDATE
    SET nombre_completo = EXCLUDED.nombre_completo,
        inicializacion_id = COALESCE(inspector.inicializacion_id, EXCLUDED.inicializacion_id),
        actualizado_en = now();

    INSERT INTO grupo_franco(codigo, nombre, fecha_ancla, posicion_inicial_ciclo, origen_ancla, inicializacion_id)
    SELECT DISTINCT s.grupo_franco_codigo,
           'Grupo importado ' || s.grupo_franco_codigo,
           s.fecha_ancla, s.posicion_inicial_ciclo,
           'HISTORICO_EXCEL'::origen_ancla, p_inicializacion_id
    FROM inicializacion_inspector_staging s
    WHERE s.inicializacion_id = p_inicializacion_id
      AND NOT EXISTS (SELECT 1 FROM grupo_franco g WHERE g.codigo = s.grupo_franco_codigo);

    INSERT INTO posicion_cuadratura(
        codigo, nombre, tipo, grupo_franco_id, perfil_rotacion_id,
        fecha_ancla, posicion_inicial_ciclo, turno_inicial, movil_inicial_id,
        origen_ancla, inicializacion_id, vigencia_desde
    )
    SELECT s.posicion_codigo, s.nombre_normalizado || ' (' || s.posicion_codigo || ')',
           s.posicion_tipo, gf.id, pr.id,
           s.fecha_ancla, s.posicion_inicial_ciclo, s.turno_inicial, m.id,
           'HISTORICO_EXCEL'::origen_ancla, p_inicializacion_id, v_desde
    FROM inicializacion_inspector_staging s
    JOIN grupo_franco gf ON gf.codigo = s.grupo_franco_codigo
    JOIN perfil_rotacion pr ON pr.codigo = s.perfil_codigo
    LEFT JOIN movil m ON m.numero = s.movil_inicial_numero
    WHERE s.inicializacion_id = p_inicializacion_id
      AND NOT EXISTS (SELECT 1 FROM posicion_cuadratura p WHERE p.codigo = s.posicion_codigo);

    INSERT INTO asignacion_inspector_posicion(
        posicion_id, inspector_id, fecha_desde, motivo, aprobado_por, inicializacion_id
    )
    SELECT p.id, i.id, v_desde, 'Asignación inicial reconstruida desde Excel',
           p_usuario_id, p_inicializacion_id
    FROM inicializacion_inspector_staging s
    JOIN posicion_cuadratura p ON p.codigo = s.posicion_codigo
    JOIN inspector i ON i.legajo = s.legajo
    WHERE s.inicializacion_id = p_inicializacion_id
    ON CONFLICT DO NOTHING;

    INSERT INTO estado_inicial_posicion(
        posicion_id, inicializacion_id, fecha_referencia, posicion_ciclo,
        turno, movil_id, indice_turno, indice_movil, codigo_origen
    )
    SELECT p.id, p_inicializacion_id, s.fecha_estado,
           ((s.fecha_estado - s.fecha_ancla + s.posicion_inicial_ciclo) % 8)::smallint,
           s.turno_inicial, m.id, s.indice_turno, s.indice_movil, s.codigo_estado
    FROM inicializacion_inspector_staging s
    JOIN posicion_cuadratura p ON p.codigo = s.posicion_codigo
    LEFT JOIN movil m ON m.numero = s.movil_inicial_numero
    WHERE s.inicializacion_id = p_inicializacion_id
    ON CONFLICT (posicion_id) DO UPDATE
    SET inicializacion_id = EXCLUDED.inicializacion_id,
        fecha_referencia = EXCLUDED.fecha_referencia,
        posicion_ciclo = EXCLUDED.posicion_ciclo,
        turno = EXCLUDED.turno,
        movil_id = EXCLUDED.movil_id,
        indice_turno = EXCLUDED.indice_turno,
        indice_movil = EXCLUDED.indice_movil,
        codigo_origen = EXCLUDED.codigo_origen;

    INSERT INTO cronograma(codigo, nombre, capa, periodo_desde, periodo_hasta, creado_por, inicializacion_id)
    VALUES (
        'BASE-INICIAL-' || left(v_hash, 12),
        'Cuadratura base inicial importada',
        'BASE'::tipo_capa,
        v_desde,
        v_hasta,
        p_usuario_id,
        p_inicializacion_id
    )
    RETURNING id INTO v_cronograma_id;

    INSERT INTO cronograma_version(cronograma_id, numero_version, estado, creada_por, motivo_cambio)
    VALUES (
        v_cronograma_id,
        1,
        'BORRADOR'::estado_version,
        p_usuario_id,
        'Inicialización única desde Excel'
    )
    RETURNING id INTO v_version_id;

    INSERT INTO bloque_cuadratura(
        version_id, posicion_id, inspector_titular_id, secuencia, tipo,
        fecha_desde, fecha_hasta, turno, movil_id, origen, es_parcial
    )
    SELECT v_version_id, p.id, CASE WHEN b.tipo = 'TRABAJO'::tipo_bloque THEN i.id END,
           b.secuencia, b.tipo, b.fecha_desde, b.fecha_hasta,
           b.turno, m.id, 'IMPORTADO'::origen_registro, b.es_parcial
    FROM inicializacion_bloque_staging b
    JOIN inicializacion_inspector_staging s
      ON s.inicializacion_id = b.inicializacion_id AND s.ordinal = b.ordinal
    JOIN posicion_cuadratura p ON p.codigo = s.posicion_codigo
    JOIN inspector i ON i.legajo = s.legajo
    LEFT JOIN movil m ON m.numero = b.movil_numero
    WHERE b.inicializacion_id = p_inicializacion_id;

    CALL sp_materializar_base(v_version_id, p_usuario_id);

    UPDATE cronograma_version SET estado = 'EN_REVISION'::estado_version,
           enviada_revision_por = p_usuario_id,
           enviada_revision_en = now()
    WHERE id = v_version_id;
    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id, observacion)
    VALUES (
        v_version_id,
        'BORRADOR'::estado_version,
        'EN_REVISION'::estado_version,
        p_usuario_id,
        'Confirmación de inicialización'
    );

    UPDATE cronograma_version
    SET estado = 'APROBADA_PUBLICADA'::estado_version,
        aprobada_publicada_por = p_usuario_id,
        aprobada_publicada_en = now()
    WHERE id = v_version_id;
    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id, observacion)
    VALUES (
        v_version_id,
        'EN_REVISION'::estado_version,
        'APROBADA_PUBLICADA'::estado_version,
        p_usuario_id,
        'Base inicial confirmada'
    );
    UPDATE cronograma SET version_actual_id = v_version_id WHERE id = v_cronograma_id;

    INSERT INTO registro_golden_master(
        inicializacion_id, inspector_id, posicion_id, fecha_operativa,
        codigo_esperado, turno_esperado, movil_esperado_id, tipo_dia_esperado
    )
    SELECT p_inicializacion_id, i.id, p.id, d.fecha_operativa,
           d.codigo_normalizado, d.turno, m.id, d.tipo_dia
    FROM inicializacion_dia_staging d
    JOIN inicializacion_inspector_staging s
      ON s.inicializacion_id = d.inicializacion_id AND s.ordinal = d.ordinal
    JOIN inspector i ON i.legajo = s.legajo
    JOIN posicion_cuadratura p ON p.codigo = s.posicion_codigo
    LEFT JOIN movil m ON m.numero = d.movil_numero
    WHERE d.inicializacion_id = p_inicializacion_id;

    UPDATE inicializacion_sistema
    SET estado = 'CONFIRMADA'::estado_inicializacion,
        fecha_confirmacion = now(),
        usuario_confirmacion_id = p_usuario_id,
        es_activa = true
    WHERE id = p_inicializacion_id;
END;
$$;

COMMIT;
