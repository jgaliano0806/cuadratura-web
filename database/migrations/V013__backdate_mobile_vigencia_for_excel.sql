BEGIN;
SET search_path TO seguridad_vial, public;

-- El Excel histórico incluye 2026-04-30; el seed fijaba vigencia en 2026-05-01
-- y el trigger fn_validar_dia_asignable rechazaba esos días ("Móvil no disponible").
UPDATE movil
SET vigencia_desde = DATE '2026-04-01'
WHERE vigencia_desde > DATE '2026-04-01';

UPDATE horario_turno_movil
SET vigencia_desde = DATE '2026-04-01'
WHERE vigencia_desde > DATE '2026-04-01';

UPDATE perfil_rotacion
SET vigencia_desde = DATE '2026-04-01'
WHERE vigencia_desde > DATE '2026-04-01';

COMMIT;
