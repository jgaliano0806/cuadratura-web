-- V024: peajistas (plantel + nombre/apellido) y catálogo editable de licencias.
-- ADD VALUE no se usa en el mismo archivo: queda disponible tras el commit de migrate.

ALTER TYPE seguridad_vial.tipo_plantel ADD VALUE IF NOT EXISTS 'PEAJISTA';

ALTER TABLE seguridad_vial.inspector
    ADD COLUMN IF NOT EXISTS nombres varchar(120),
    ADD COLUMN IF NOT EXISTS apellido varchar(120);

UPDATE seguridad_vial.inspector
SET apellido = NULLIF(trim(split_part(nombre_completo, ',', 1)), ''),
    nombres = NULLIF(trim(split_part(nombre_completo, ',', 2)), '')
WHERE nombre_completo LIKE '%,%'
  AND (nombres IS NULL OR apellido IS NULL);

CREATE TABLE IF NOT EXISTS seguridad_vial.catalogo_licencia (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo varchar(40) NOT NULL UNIQUE,
    nombre varchar(160) NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    orden smallint NOT NULL DEFAULT 100,
    creado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO seguridad_vial.catalogo_licencia (codigo, nombre, orden) VALUES
    ('ORDINARIA', 'Licencia ordinaria', 10),
    ('ESTUDIO', 'Licencia por estudio', 20),
    ('MATERNIDAD', 'Licencia por maternidad', 30),
    ('PATERNIDAD', 'Licencia por paternidad', 40),
    ('DUELLO', 'Licencia por duelo', 50),
    ('PARTICULAR', 'Licencia particular', 60),
    ('ART', 'ART / accidente laboral', 70),
    ('GREMIO', 'Licencia gremial', 80)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE seguridad_vial.asignacion_operativa
    ADD COLUMN IF NOT EXISTS catalogo_licencia_id uuid
        REFERENCES seguridad_vial.catalogo_licencia(id);

CREATE INDEX IF NOT EXISTS ix_asignacion_operativa_licencia
    ON seguridad_vial.asignacion_operativa (catalogo_licencia_id)
    WHERE catalogo_licencia_id IS NOT NULL;

COMMENT ON TABLE seguridad_vial.catalogo_licencia IS
'Tipos de licencia operativa. Se eligen al registrar una LICENCIA y se pueden dar de alta o baja.';
COMMENT ON COLUMN seguridad_vial.inspector.nombres IS 'Nombre de pila. nombre_completo se arma como Apellido, Nombres.';
COMMENT ON COLUMN seguridad_vial.inspector.apellido IS 'Apellido. nombre_completo se arma como Apellido, Nombres.';
