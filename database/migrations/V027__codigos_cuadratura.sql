BEGIN;
SET search_path TO seguridad_vial, public;

ALTER TABLE catalogo_licencia
    ADD COLUMN IF NOT EXISTS codigo_sap varchar(12),
    ADD COLUMN IF NOT EXISTS horario varchar(80),
    ADD COLUMN IF NOT EXISTS ambito varchar(32) NOT NULL DEFAULT 'SEGURIDAD_VIAL',
    ADD COLUMN IF NOT EXISTS tipo varchar(16) NOT NULL DEFAULT 'AUSENCIA';

ALTER TABLE catalogo_licencia
    DROP CONSTRAINT IF EXISTS catalogo_licencia_codigo_key;

ALTER TABLE catalogo_licencia
    DROP CONSTRAINT IF EXISTS ck_catalogo_licencia_ambito;
ALTER TABLE catalogo_licencia
    ADD CONSTRAINT ck_catalogo_licencia_ambito
    CHECK (ambito IN ('SEGURIDAD_VIAL', 'BASE_OPERACIONES'));

ALTER TABLE catalogo_licencia
    DROP CONSTRAINT IF EXISTS ck_catalogo_licencia_tipo;
ALTER TABLE catalogo_licencia
    ADD CONSTRAINT ck_catalogo_licencia_tipo
    CHECK (tipo IN ('TURNO', 'AUSENCIA', 'FRANCO', 'OTRO'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_catalogo_licencia_ambito_codigo
    ON catalogo_licencia (ambito, codigo);

COMMENT ON TABLE catalogo_licencia IS
'Códigos de cuadratura (turno y ausentismo): código interno, SAP y horario/descripción.';
COMMENT ON COLUMN catalogo_licencia.codigo IS 'Código de cuadratura (M1, AC, V, F, …).';
COMMENT ON COLUMN catalogo_licencia.codigo_sap IS 'Código SAP (0005, 02AC, …).';
COMMENT ON COLUMN catalogo_licencia.horario IS 'Franja horaria o descripción del código.';
COMMENT ON COLUMN catalogo_licencia.ambito IS 'SEGURIDAD_VIAL o BASE_OPERACIONES.';
COMMENT ON COLUMN catalogo_licencia.tipo IS 'TURNO, AUSENCIA, FRANCO u OTRO.';

-- Los tipos genéricos previos dejan de ofrecerse; el catálogo que rige es el operativo.
UPDATE catalogo_licencia
SET activo = false,
    tipo = 'AUSENCIA',
    ambito = 'SEGURIDAD_VIAL'
WHERE codigo IN (
    'ORDINARIA', 'ESTUDIO', 'MATERNIDAD', 'PATERNIDAD',
    'DUELLO', 'PARTICULAR', 'ART', 'GREMIO'
);

INSERT INTO catalogo_licencia (codigo, codigo_sap, nombre, horario, ambito, tipo, orden, activo)
VALUES
    -- Seguridad Vial · turnos
    ('M1', '0005', '05:00 a 13:00', '05:00 a 13:00', 'SEGURIDAD_VIAL', 'TURNO', 10, true),
    ('M2', '0005', '05:00 a 13:00', '05:00 a 13:00', 'SEGURIDAD_VIAL', 'TURNO', 11, true),
    ('M4', '0005', '05:00 a 13:00', '05:00 a 13:00', 'SEGURIDAD_VIAL', 'TURNO', 12, true),
    ('M6', '0007', '06:00 a 14:00', '06:00 a 14:00', 'SEGURIDAD_VIAL', 'TURNO', 13, true),
    ('M3', '0009', '07:00 a 15:00', '07:00 a 15:00', 'SEGURIDAD_VIAL', 'TURNO', 14, true),
    ('M5', '0009', '07:00 a 15:00', '07:00 a 15:00', 'SEGURIDAD_VIAL', 'TURNO', 15, true),
    ('M7', '0009', '07:00 a 15:00', '07:00 a 15:00', 'SEGURIDAD_VIAL', 'TURNO', 16, true),
    ('T1', '0012', '13:00 a 21:00', '13:00 a 21:00', 'SEGURIDAD_VIAL', 'TURNO', 20, true),
    ('T2', '0012', '13:00 a 21:00', '13:00 a 21:00', 'SEGURIDAD_VIAL', 'TURNO', 21, true),
    ('T4', '0012', '13:00 a 21:00', '13:00 a 21:00', 'SEGURIDAD_VIAL', 'TURNO', 22, true),
    ('T6', '0014', '14:00 a 22:00', '14:00 a 22:00', 'SEGURIDAD_VIAL', 'TURNO', 23, true),
    ('T3', '0016', '15:00 a 23:00', '15:00 a 23:00', 'SEGURIDAD_VIAL', 'TURNO', 24, true),
    ('T5', '0016', '15:00 a 23:00', '15:00 a 23:00', 'SEGURIDAD_VIAL', 'TURNO', 25, true),
    ('T7', '0016', '15:00 a 23:00', '15:00 a 23:00', 'SEGURIDAD_VIAL', 'TURNO', 26, true),
    ('N1', '0019', '21:00 a 05:00', '21:00 a 05:00', 'SEGURIDAD_VIAL', 'TURNO', 30, true),
    ('N2', '0019', '21:00 a 05:00', '21:00 a 05:00', 'SEGURIDAD_VIAL', 'TURNO', 31, true),
    ('N4', '0019', '21:00 a 05:00', '21:00 a 05:00', 'SEGURIDAD_VIAL', 'TURNO', 32, true),
    ('N6', '0021', '22:00 a 06:00', '22:00 a 06:00', 'SEGURIDAD_VIAL', 'TURNO', 33, true),
    ('N3', '0023', '23:00 a 07:00', '23:00 a 07:00', 'SEGURIDAD_VIAL', 'TURNO', 34, true),
    ('N5', '0023', '23:00 a 07:00', '23:00 a 07:00', 'SEGURIDAD_VIAL', 'TURNO', 35, true),
    ('N7', '0023', '23:00 a 07:00', '23:00 a 07:00', 'SEGURIDAD_VIAL', 'TURNO', 36, true),
    -- Seguridad Vial · ausentismo / franco
    ('AC', '02AC', 'Accidente a cargo empresa', 'Accidente a cargo empresa', 'SEGURIDAD_VIAL', 'AUSENCIA', 100, true),
    ('AR', NULL, 'Accidente ART', 'Accidente ART', 'SEGURIDAD_VIAL', 'AUSENCIA', 101, true),
    ('EF', '01EF', 'Enfermedad', 'Enfermedad', 'SEGURIDAD_VIAL', 'AUSENCIA', 102, true),
    ('EC', '34EC', 'COVID / enfermedad contagiosa', 'COVID / enfermedad contagiosa', 'SEGURIDAD_VIAL', 'AUSENCIA', 103, true),
    ('FS', '10FS', 'Donación de sangre', 'Donación de sangre', 'SEGURIDAD_VIAL', 'AUSENCIA', 104, true),
    ('FA', '16FA', 'Falta sin aviso', 'Falta sin aviso', 'SEGURIDAD_VIAL', 'AUSENCIA', 105, true),
    ('FJ', '17FJ', 'Falta justificada', 'Falta justificada', 'SEGURIDAD_VIAL', 'AUSENCIA', 106, true),
    ('FI', '18FI', 'Falta injustificada', 'Falta injustificada', 'SEGURIDAD_VIAL', 'AUSENCIA', 107, true),
    ('FC', '30FC', 'Franco compensatorio', 'Franco compensatorio', 'SEGURIDAD_VIAL', 'AUSENCIA', 108, true),
    ('V', '31VC', 'Vacaciones goce', 'Vacaciones goce', 'SEGURIDAD_VIAL', 'AUSENCIA', 109, true),
    ('SA', '36SA', 'Salida anticipada', 'Salida anticipada', 'SEGURIDAD_VIAL', 'AUSENCIA', 110, true),
    ('LT', '37LT', 'Llegada tarde', 'Llegada tarde', 'SEGURIDAD_VIAL', 'AUSENCIA', 111, true),
    ('TA', '38TA', 'Llegada tarde autorizada', 'Llegada tarde autorizada', 'SEGURIDAD_VIAL', 'AUSENCIA', 112, true),
    ('LF', '15LF', 'Licencia por fallecimiento', 'Licencia por fallecimiento', 'SEGURIDAD_VIAL', 'AUSENCIA', 113, true),
    ('LG', '12LG', 'Licencia gremial', 'Licencia gremial', 'SEGURIDAD_VIAL', 'AUSENCIA', 114, true),
    ('FM', '13FM', 'Licencia por matrimonio', 'Licencia por matrimonio', 'SEGURIDAD_VIAL', 'AUSENCIA', 115, true),
    ('LMZ', NULL, 'Licencia por mudanza', 'Licencia por mudanza', 'SEGURIDAD_VIAL', 'AUSENCIA', 116, true),
    ('PE', NULL, 'Permiso especial', 'Permiso especial', 'SEGURIDAD_VIAL', 'AUSENCIA', 117, true),
    ('FE', NULL, 'Licencia examen educativo', 'Licencia examen educativo', 'SEGURIDAD_VIAL', 'AUSENCIA', 118, true),
    ('F', NULL, 'Libre', 'Libre', 'SEGURIDAD_VIAL', 'FRANCO', 119, true),
    -- Base de operaciones · turnos
    ('M', '0007', '06:00 a 14:00', '06:00 a 14:00', 'BASE_OPERACIONES', 'TURNO', 10, true),
    ('T', '0014', '14:00 a 22:00', '14:00 a 22:00', 'BASE_OPERACIONES', 'TURNO', 20, true),
    ('N', '0021', '22:00 a 06:00', '22:00 a 06:00', 'BASE_OPERACIONES', 'TURNO', 30, true),
    -- Base de operaciones · ausentismo / franco
    ('AC', '02AC', 'Accidente a cargo empresa', 'Accidente a cargo empresa', 'BASE_OPERACIONES', 'AUSENCIA', 100, true),
    ('AR', NULL, 'Accidente ART', 'Accidente ART', 'BASE_OPERACIONES', 'AUSENCIA', 101, true),
    ('EF', '01EF', 'Enfermedad', 'Enfermedad', 'BASE_OPERACIONES', 'AUSENCIA', 102, true),
    ('EC', '34EC', 'COVID / enfermedad contagiosa', 'COVID / enfermedad contagiosa', 'BASE_OPERACIONES', 'AUSENCIA', 103, true),
    ('FS', '10FS', 'Donación de sangre', 'Donación de sangre', 'BASE_OPERACIONES', 'AUSENCIA', 104, true),
    ('FA', '16FA', 'Falta sin aviso', 'Falta sin aviso', 'BASE_OPERACIONES', 'AUSENCIA', 105, true),
    ('FJ', '17FJ', 'Falta justificada', 'Falta justificada', 'BASE_OPERACIONES', 'AUSENCIA', 106, true),
    ('FI', '18FI', 'Falta injustificada', 'Falta injustificada', 'BASE_OPERACIONES', 'AUSENCIA', 107, true),
    ('FC', '30FC', 'Franco compensatorio', 'Franco compensatorio', 'BASE_OPERACIONES', 'AUSENCIA', 108, true),
    ('V', '31VC', 'Vacaciones goce', 'Vacaciones goce', 'BASE_OPERACIONES', 'AUSENCIA', 109, true),
    ('SA', '36SA', 'Salida anticipada', 'Salida anticipada', 'BASE_OPERACIONES', 'AUSENCIA', 110, true),
    ('LT', '37LT', 'Llegada tarde', 'Llegada tarde', 'BASE_OPERACIONES', 'AUSENCIA', 111, true),
    ('TA', '38TA', 'Llegada tarde autorizada', 'Llegada tarde autorizada', 'BASE_OPERACIONES', 'AUSENCIA', 112, true),
    ('LF', '15LF', 'Licencia por fallecimiento', 'Licencia por fallecimiento', 'BASE_OPERACIONES', 'AUSENCIA', 113, true),
    ('LG', '12LG', 'Licencia gremial', 'Licencia gremial', 'BASE_OPERACIONES', 'AUSENCIA', 114, true),
    ('FM', '13FM', 'Licencia por matrimonio', 'Licencia por matrimonio', 'BASE_OPERACIONES', 'AUSENCIA', 115, true),
    ('LMZ', NULL, 'Licencia por mudanza', 'Licencia por mudanza', 'BASE_OPERACIONES', 'AUSENCIA', 116, true),
    ('PE', NULL, 'Permiso especial', 'Permiso especial', 'BASE_OPERACIONES', 'AUSENCIA', 117, true),
    ('FE', NULL, 'Licencia examen educativo', 'Licencia examen educativo', 'BASE_OPERACIONES', 'AUSENCIA', 118, true),
    ('F', NULL, 'Libre', 'Libre', 'BASE_OPERACIONES', 'FRANCO', 119, true)
ON CONFLICT (ambito, codigo) DO UPDATE SET
    codigo_sap = EXCLUDED.codigo_sap,
    nombre = EXCLUDED.nombre,
    horario = EXCLUDED.horario,
    tipo = EXCLUDED.tipo,
    orden = EXCLUDED.orden,
    activo = true;

COMMIT;
