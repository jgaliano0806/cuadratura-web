BEGIN;
SET search_path TO seguridad_vial, public;

ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS legajo varchar(40),
    ADD COLUMN IF NOT EXISTS apellido varchar(120),
    ADD COLUMN IF NOT EXISTS nombres varchar(160),
    ADD COLUMN IF NOT EXISTS secciones_todas boolean NOT NULL DEFAULT false;

UPDATE usuario
SET nombres = coalesce(nullif(btrim(nombres), ''), nombre_mostrar)
WHERE nombres IS NULL OR btrim(nombres) = '';

UPDATE usuario
SET secciones_todas = true
WHERE nombre_usuario IN ('admin_sv', 'jefe', 'consulta');

CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_legajo
    ON usuario (lower(btrim(legajo)))
    WHERE legajo IS NOT NULL AND btrim(legajo) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_email
    ON usuario (lower(btrim(email)))
    WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE TABLE IF NOT EXISTS usuario_seccion (
    usuario_id uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    seccion varchar(40) NOT NULL,
    PRIMARY KEY (usuario_id, seccion),
    CONSTRAINT ck_usuario_seccion CHECK (seccion IN (
        'MOVILES', 'EPI', 'BO',
        'APC', 'AUTOVIA_CALAMUCHITA', 'AUTOVIA_PUNILLA',
        'RUTA_19', 'RUTA_20', 'RUTA_2JC',
        'RUTA_36', 'RUTA_36_ARROYO_TEGUA', 'RUTA_36_PIEDRAS_MORAS',
        'RUTA_5', 'RUTA_9_NORTE', 'RUTA_9_SUR',
        'RUTA_E53', 'RUTA_E55'
    ))
);

INSERT INTO rol(codigo, nombre, descripcion) VALUES
(
    'RECURSOS_HUMANOS',
    'Recursos humanos',
    'Consulta de todos los planteles; no administra usuarios'
)
ON CONFLICT (codigo) DO NOTHING;

COMMENT ON COLUMN usuario.legajo IS 'Legajo del responsable (Timer / planillas).';
COMMENT ON COLUMN usuario.secciones_todas IS 'Si es true, ve todas las secciones.';
COMMENT ON TABLE usuario_seccion IS 'Ámbito visible del usuario cuando no tiene todas las secciones.';

COMMIT;
