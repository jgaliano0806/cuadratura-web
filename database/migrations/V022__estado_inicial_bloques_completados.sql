BEGIN;
SET search_path TO seguridad_vial, public;

-- Sin BASE (Excel), el motor no puede inferir cuántos bloques ya completó
-- cada posición en su móvil actual. Se almacena explícitamente en el estado.
ALTER TABLE estado_inicial_posicion
  ADD COLUMN IF NOT EXISTS bloques_completados_movil smallint NOT NULL DEFAULT 0
  CHECK (bloques_completados_movil BETWEEN 0 AND 4);

COMMENT ON COLUMN estado_inicial_posicion.bloques_completados_movil IS
  'Bloques 5×3 ya cerrados en el móvil actual al iniciar la fecha_referencia. Usado por el motor de proyección para saber cuándo rotar de móvil (regla RN-011).';

COMMIT;
