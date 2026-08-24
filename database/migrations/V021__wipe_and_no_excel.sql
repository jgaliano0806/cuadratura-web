BEGIN;
SET search_path TO seguridad_vial, public;
SET LOCAL session_replication_role = 'replica';

-- ------------------------------------------------------------------
-- Wipe total de datos operativos. Mantiene catálogos y usuarios.
-- La plataforma pasa a operar sin importación Excel: la planificación
-- se genera desde configuración (perfiles, posiciones, anclas).
-- ------------------------------------------------------------------

TRUNCATE TABLE
    seguridad_vial.registro_golden_master,
    seguridad_vial.materializacion_ejecucion,
    seguridad_vial.version_estado_historial,
    seguridad_vial.evento_auditoria,
    seguridad_vial.evento_real,
    seguridad_vial.ajuste_planificacion,
    seguridad_vial.reemplazo_novedad,
    seguridad_vial.cobertura_dia,
    seguridad_vial.dia_cronograma,
    seguridad_vial.bloque_cuadratura,
    seguridad_vial.cronograma_version,
    seguridad_vial.cronograma,
    seguridad_vial.vacacion_detalle,
    seguridad_vial.novedad_operativa,
    seguridad_vial.asignacion_operativa,
    seguridad_vial.asignacion_inspector_posicion,
    seguridad_vial.estado_inicial_posicion,
    seguridad_vial.miembro_grupo_rotacion_vinculada,
    seguridad_vial.grupo_rotacion_vinculada,
    seguridad_vial.posicion_cuadratura,
    seguridad_vial.grupo_franco,
    seguridad_vial.inspector,
    seguridad_vial.error_inicializacion
RESTART IDENTITY CASCADE;

-- Vaciar staging del Excel.
DO $$
BEGIN
  IF to_regclass('seguridad_vial.inicializacion_dia_staging') IS NOT NULL THEN
    EXECUTE 'TRUNCATE seguridad_vial.inicializacion_dia_staging CASCADE';
  END IF;
  IF to_regclass('seguridad_vial.inicializacion_bloque_staging') IS NOT NULL THEN
    EXECUTE 'TRUNCATE seguridad_vial.inicializacion_bloque_staging CASCADE';
  END IF;
  IF to_regclass('seguridad_vial.inicializacion_inspector_staging') IS NOT NULL THEN
    EXECUTE 'TRUNCATE seguridad_vial.inicializacion_inspector_staging CASCADE';
  END IF;
  IF to_regclass('seguridad_vial.inicializacion_sistema') IS NOT NULL THEN
    EXECUTE 'TRUNCATE seguridad_vial.inicializacion_sistema CASCADE';
  END IF;
END;
$$;

COMMIT;
