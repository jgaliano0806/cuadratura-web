\set ON_ERROR_STOP on
SET search_path TO seguridad_vial, public;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'seguridad_vial') THEN
        RAISE EXCEPTION 'No existe el esquema seguridad_vial';
    END IF;
    IF (SELECT count(*) FROM movil) <> 7 THEN
        RAISE EXCEPTION 'Deben existir siete móviles (1-5 + R36 6-7)';
    END IF;
    IF (SELECT count(*) FROM posicion_cuadratura WHERE codigo LIKE 'M4-P%' AND codigo NOT LIKE '%EXT%') <> 5 THEN
        RAISE EXCEPTION 'Deben existir cinco posiciones M4';
    END IF;
    IF (SELECT count(*) FROM posicion_cuadratura WHERE codigo LIKE 'M6-P%') <> 5 THEN
        RAISE EXCEPTION 'Deben existir cinco posiciones M6 (Ruta 36)';
    END IF;
    IF (SELECT count(*) FROM posicion_cuadratura WHERE codigo LIKE 'M7-P%') <> 5 THEN
        RAISE EXCEPTION 'Deben existir cinco posiciones M7 (Ruta 36)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM base_operativa WHERE codigo = 'RUTA36') THEN
        RAISE EXCEPTION 'Falta la base operativa Ruta 36';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM rol WHERE codigo = 'ADMINISTRACION_SEGURIDAD_VIAL') THEN
        RAISE EXCEPTION 'Falta el rol Administración de Seguridad Vial';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM rol WHERE codigo = 'JEFE_SECTOR') THEN
        RAISE EXCEPTION 'Falta el rol Jefe del sector';
    END IF;
END;
$$;

SELECT 'OK' AS estado,
       (SELECT count(*) FROM movil) AS moviles,
       (SELECT count(*) FROM posicion_cuadratura WHERE codigo LIKE 'M4-P%' AND codigo NOT LIKE '%EXT%') AS posiciones_m4,
       (SELECT count(*) FROM posicion_cuadratura WHERE codigo LIKE 'M6-P%') AS posiciones_m6,
       (SELECT count(*) FROM posicion_cuadratura WHERE codigo LIKE 'M7-P%') AS posiciones_m7,
       (SELECT count(*) FROM rol) AS roles,
       (SELECT count(*) FROM permiso) AS permisos;
