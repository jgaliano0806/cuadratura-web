BEGIN;
SET search_path TO seguridad_vial, public;

-- Versión 2.7 opera sin Excel y sin datos históricos en la capa BASE,
-- pero el trigger de integridad exige que las PLANIFICADAS deriven de una BASE
-- publicada. Se crea una BASE "seed" vacía anclada al corte 2026-06-01 para
-- satisfacer esa integridad sin arrastrar información inventada.

DO $$
DECLARE
  v_admin_id uuid;
  v_cronograma_id uuid;
  v_version_id uuid;
BEGIN
  SELECT id INTO v_admin_id
  FROM usuario
  WHERE nombre_usuario = 'admin.sv'
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM usuario ORDER BY creado_en LIMIT 1;
  END IF;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No hay usuarios cargados para asignar como creador de la BASE seed';
  END IF;

  SELECT id INTO v_cronograma_id
  FROM cronograma
  WHERE codigo = 'BASE-SEED-2_7';

  IF v_cronograma_id IS NULL THEN
    INSERT INTO cronograma(codigo, nombre, capa, periodo_desde, periodo_hasta, creado_por)
    VALUES (
      'BASE-SEED-2_7',
      'BASE seed 2.7 (sin datos históricos)',
      'BASE'::tipo_capa,
      DATE '2026-06-01',
      DATE '2029-06-01',
      v_admin_id
    )
    RETURNING id INTO v_cronograma_id;
  END IF;

  SELECT id INTO v_version_id
  FROM cronograma_version
  WHERE cronograma_id = v_cronograma_id
    AND estado = 'APROBADA_PUBLICADA'::estado_version
  LIMIT 1;

  IF v_version_id IS NULL THEN
    INSERT INTO cronograma_version(
      cronograma_id, numero_version, estado,
      creada_por, aprobada_publicada_por, aprobada_publicada_en,
      motivo_cambio
    ) VALUES (
      v_cronograma_id, 1, 'APROBADA_PUBLICADA'::estado_version,
      v_admin_id, v_admin_id, TIMESTAMPTZ '2026-06-01 00:00:00-03',
      'BASE seed 2.7: ancla para derivación de PLANIFICADAS sin capa histórica'
    )
    RETURNING id INTO v_version_id;
  END IF;
END $$;

COMMIT;
