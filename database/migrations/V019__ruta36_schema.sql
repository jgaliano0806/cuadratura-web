BEGIN;
SET search_path TO seguridad_vial, public;

-- Ampliar catálogo de móviles a 1..7 (Ruta 36: móviles 6 y 7).
ALTER TABLE seguridad_vial.movil DROP CONSTRAINT IF EXISTS movil_numero_check;
ALTER TABLE seguridad_vial.movil
  ADD CONSTRAINT movil_numero_check CHECK (numero BETWEEN 1 AND 7);

-- Staging del Excel (si existe): permitir móviles 6 y 7.
DO $$
BEGIN
  IF to_regclass('seguridad_vial.inicializacion_posicion_staging') IS NOT NULL THEN
    ALTER TABLE seguridad_vial.inicializacion_posicion_staging
      DROP CONSTRAINT IF EXISTS inicializacion_posicion_staging_movil_inicial_numero_check;
    ALTER TABLE seguridad_vial.inicializacion_posicion_staging
      ADD CONSTRAINT inicializacion_posicion_staging_movil_inicial_numero_check
      CHECK (movil_inicial_numero IS NULL OR movil_inicial_numero BETWEEN 1 AND 7);
  END IF;

  IF to_regclass('seguridad_vial.inicializacion_bloque_staging') IS NOT NULL THEN
    ALTER TABLE seguridad_vial.inicializacion_bloque_staging
      DROP CONSTRAINT IF EXISTS inicializacion_bloque_staging_movil_numero_check;
    ALTER TABLE seguridad_vial.inicializacion_bloque_staging
      ADD CONSTRAINT inicializacion_bloque_staging_movil_numero_check
      CHECK (movil_numero IS NULL OR movil_numero BETWEEN 1 AND 7);
  END IF;

  IF to_regclass('seguridad_vial.inicializacion_dia_staging') IS NOT NULL THEN
    ALTER TABLE seguridad_vial.inicializacion_dia_staging
      DROP CONSTRAINT IF EXISTS inicializacion_dia_staging_movil_numero_check;
    ALTER TABLE seguridad_vial.inicializacion_dia_staging
      ADD CONSTRAINT inicializacion_dia_staging_movil_numero_check
      CHECK (movil_numero IS NULL OR movil_numero BETWEEN 1 AND 7);
  END IF;
END;
$$;

-- Tipos de posición para cuadraturas propias R36.
ALTER TYPE seguridad_vial.tipo_posicion ADD VALUE IF NOT EXISTS 'MOVIL6';
ALTER TYPE seguridad_vial.tipo_posicion ADD VALUE IF NOT EXISTS 'MOVIL7';

-- Estados iniciales pueden existir sin Excel (configuración operativa).
ALTER TABLE seguridad_vial.estado_inicial_posicion
  ALTER COLUMN inicializacion_id DROP NOT NULL;

COMMIT;
