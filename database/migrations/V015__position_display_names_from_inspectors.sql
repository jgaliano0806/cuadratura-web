-- V015: nombres de posición legibles (inspector + código técnico)
BEGIN;

CREATE OR REPLACE FUNCTION seguridad_vial.fn_actualizar_nombre_posicion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE seguridad_vial.posicion_cuadratura p
  SET nombre = i.nombre_completo || ' (' || p.codigo || ')'
  FROM seguridad_vial.inspector i
  WHERE p.id = NEW.posicion_id
    AND i.id = NEW.inspector_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nombre_posicion_asignacion
  ON seguridad_vial.asignacion_inspector_posicion;

CREATE TRIGGER trg_nombre_posicion_asignacion
AFTER INSERT OR UPDATE OF inspector_id, posicion_id
ON seguridad_vial.asignacion_inspector_posicion
FOR EACH ROW
EXECUTE FUNCTION seguridad_vial.fn_actualizar_nombre_posicion();

-- Datos ya existentes
UPDATE seguridad_vial.posicion_cuadratura p
SET nombre = i.nombre_completo || ' (' || p.codigo || ')'
FROM seguridad_vial.asignacion_inspector_posicion a
JOIN seguridad_vial.inspector i ON i.id = a.inspector_id
WHERE a.posicion_id = p.id
  AND current_date <@ a.vigencia;

COMMIT;
