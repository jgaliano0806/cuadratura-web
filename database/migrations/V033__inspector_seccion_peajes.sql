-- Amplía el CHECK de seccion para incluir las rutas de peajes.
ALTER TABLE seguridad_vial.inspector
  DROP CONSTRAINT IF EXISTS ck_inspector_seccion;

ALTER TABLE seguridad_vial.inspector
  ADD CONSTRAINT ck_inspector_seccion
  CHECK (seccion IS NULL OR seccion IN (
    'MOVILES', 'EPI', 'BO',
    'APC', 'AUTOVIA_CALAMUCHITA', 'AUTOVIA_PUNILLA',
    'RUTA_19', 'RUTA_20', 'RUTA_2JC',
    'RUTA_36', 'RUTA_36_ARROYO_TEGUA', 'RUTA_36_PIEDRAS_MORAS',
    'RUTA_5', 'RUTA_9_NORTE', 'RUTA_9_SUR',
    'RUTA_E53', 'RUTA_E55'
  ));

COMMENT ON COLUMN seguridad_vial.inspector.seccion IS
  'Sección: Seguridad Vial (MOVILES, EPI, BO) o ruta de Peajes.';

-- Amplía también el CHECK en la tabla de períodos históricos.
ALTER TABLE seguridad_vial.inspector_seccion_periodo
  DROP CONSTRAINT IF EXISTS ck_insp_seccion_periodo_seccion;

ALTER TABLE seguridad_vial.inspector_seccion_periodo
  ADD CONSTRAINT ck_insp_seccion_periodo_seccion
  CHECK (seccion IN (
    'MOVILES', 'EPI', 'BO',
    'APC', 'AUTOVIA_CALAMUCHITA', 'AUTOVIA_PUNILLA',
    'RUTA_19', 'RUTA_20', 'RUTA_2JC',
    'RUTA_36', 'RUTA_36_ARROYO_TEGUA', 'RUTA_36_PIEDRAS_MORAS',
    'RUTA_5', 'RUTA_9_NORTE', 'RUTA_9_SUR',
    'RUTA_E53', 'RUTA_E55'
  ));
