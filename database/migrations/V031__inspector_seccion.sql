-- Sección de Seguridad Vial (Móviles / E.P.I. / B.O.), distinta de titular/reemplazante.
ALTER TABLE seguridad_vial.inspector
  ADD COLUMN IF NOT EXISTS seccion varchar(20);

UPDATE seguridad_vial.inspector
SET seccion = 'MOVILES'
WHERE tipo_plantel <> 'PEAJISTA'
  AND seccion IS NULL;

ALTER TABLE seguridad_vial.inspector
  DROP CONSTRAINT IF EXISTS ck_inspector_seccion;

ALTER TABLE seguridad_vial.inspector
  ADD CONSTRAINT ck_inspector_seccion
  CHECK (seccion IS NULL OR seccion IN ('MOVILES', 'EPI', 'BO'));

COMMENT ON COLUMN seguridad_vial.inspector.seccion IS
  'Sección SV: MOVILES, EPI o BO. Independiente de tipo_plantel (titular/reemplazante).';
