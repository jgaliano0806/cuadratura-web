BEGIN;
SET search_path TO seguridad_vial, public;

CREATE TABLE catalogo_timer_motivo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    orden integer NOT NULL DEFAULT 0,
    CONSTRAINT ck_catalogo_timer_motivo_nombre CHECK (char_length(btrim(nombre)) >= 3)
);

CREATE UNIQUE INDEX ux_catalogo_timer_motivo_nombre
    ON catalogo_timer_motivo (lower(btrim(nombre)));

CREATE INDEX ix_catalogo_timer_motivo_orden
    ON catalogo_timer_motivo (activo, orden, nombre);

COMMENT ON TABLE catalogo_timer_motivo IS
'Validar del Timer: Motivo de la Novedad/Cambio. Se elige en Cuadratura y se edita en Administración.';

INSERT INTO catalogo_timer_motivo (nombre, orden) VALUES
    ('Accidente ART', 10),
    ('Aprobación Horas Extras', 20),
    ('Autorizada por Jefatura', 30),
    ('Avería Mecánica Vehículo', 40),
    ('Cambio de Turno entre Personal', 50),
    ('Cambios Defasados', 60),
    ('Congestión de Tránsito', 70),
    ('Devolución de Franco Operativa', 80),
    ('Inconveniente Transporte Público', 90),
    ('Llamado por Familiar', 100),
    ('Operativo', 110),
    ('Otros', 120),
    ('Reemplazo entre Personal', 130),
    ('Se quedó Dormido', 140),
    ('Sin Novedad', 150),
    ('Síntomas de Enfermedad', 160);

COMMIT;
