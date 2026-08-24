BEGIN;
SET search_path TO seguridad_vial, public;

-- ------------------------------------------------------------------
-- RN-033: Cuadratura Ruta 36 — móviles 6 (Piedras Moras) y 7 (Arroyo Tegua)
-- Anclas verificadas contra cronograma JUNIO 2026 (referencia 01/06/2026).
-- ------------------------------------------------------------------

INSERT INTO base_operativa(codigo, nombre, ubicacion_descriptiva) VALUES
('RUTA36', 'Ruta 36', 'Base de los móviles 6 (Piedras Moras) y 7 (Arroyo Tegua)')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO movil(numero, base_operativa_id, capacidad_maxima, vigencia_desde)
SELECT n.numero, b.id, 2, DATE '2026-06-01'
FROM (VALUES (6), (7)) n(numero)
JOIN base_operativa b ON b.codigo = 'RUTA36'
ON CONFLICT (numero) DO NOTHING;

UPDATE movil m
SET base_operativa_id = b.id,
    capacidad_maxima = 2,
    vigencia_desde = LEAST(m.vigencia_desde, DATE '2026-06-01')
FROM base_operativa b
WHERE b.codigo = 'RUTA36' AND m.numero IN (6, 7);

-- Horarios: duración 480 min (RN-014). M6 06→14→22; M7 07→15→23.
INSERT INTO horario_turno_movil(movil_id, turno, hora_inicio, duracion_minutos, vigencia_desde)
SELECT m.id, x.turno, x.hora_inicio, 480, DATE '2026-06-01'
FROM movil m
JOIN (VALUES
    (6, 'M'::turno_codigo, TIME '06:00'),
    (6, 'T', TIME '14:00'),
    (6, 'N', TIME '22:00'),
    (7, 'M', TIME '07:00'),
    (7, 'T', TIME '15:00'),
    (7, 'N', TIME '23:00')
) x(numero, turno, hora_inicio) ON x.numero = m.numero
ON CONFLICT DO NOTHING;

INSERT INTO perfil_rotacion(codigo, nombre, tipo, vigencia_desde) VALUES
('MOVIL6_FIJO', 'Móvil 6 Piedras Moras (Ruta 36) M-N-T', 'FIJO_MOVIL', DATE '2026-06-01'),
('MOVIL7_FIJO', 'Móvil 7 Arroyo Tegua (Ruta 36) M-N-T', 'FIJO_MOVIL', DATE '2026-06-01')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO perfil_rotacion_turno(perfil_id, orden, turno)
SELECT p.id, x.orden, x.turno
FROM perfil_rotacion p
JOIN (VALUES
    ('MOVIL6_FIJO', 1, 'M'::turno_codigo),
    ('MOVIL6_FIJO', 2, 'N'),
    ('MOVIL6_FIJO', 3, 'T'),
    ('MOVIL7_FIJO', 1, 'M'),
    ('MOVIL7_FIJO', 2, 'N'),
    ('MOVIL7_FIJO', 3, 'T')
) x(codigo, orden, turno) ON x.codigo = p.codigo
ON CONFLICT DO NOTHING;

INSERT INTO perfil_rotacion_movil(perfil_id, orden, movil_id)
SELECT p.id, 1, m.id
FROM perfil_rotacion p
JOIN movil m ON (
    (p.codigo = 'MOVIL6_FIJO' AND m.numero = 6) OR
    (p.codigo = 'MOVIL7_FIJO' AND m.numero = 7)
)
WHERE p.codigo IN ('MOVIL6_FIJO', 'MOVIL7_FIJO')
ON CONFLICT DO NOTHING;

INSERT INTO grupo_franco(codigo, nombre, fecha_ancla, posicion_inicial_ciclo, origen_ancla)
VALUES
('GF-M6-P01', 'Grupo M6-P01', DATE '2026-06-01', 0, 'CONFIGURACION'),
('GF-M6-P02', 'Grupo M6-P02', DATE '2026-06-01', 0, 'CONFIGURACION'),
('GF-M6-P03', 'Grupo M6-P03', DATE '2026-06-01', 0, 'CONFIGURACION'),
('GF-M6-P04', 'Grupo M6-P04', DATE '2026-06-03', 0, 'CONFIGURACION'),
('GF-M6-P05', 'Grupo M6-P05', DATE '2026-06-03', 0, 'CONFIGURACION'),
('GF-M7-P01', 'Grupo M7-P01', DATE '2026-06-01', 0, 'CONFIGURACION'),
('GF-M7-P02', 'Grupo M7-P02', DATE '2026-06-01', 0, 'CONFIGURACION'),
('GF-M7-P03', 'Grupo M7-P03', DATE '2026-06-01', 0, 'CONFIGURACION'),
('GF-M7-P04', 'Grupo M7-P04', DATE '2026-06-03', 0, 'CONFIGURACION'),
('GF-M7-P05', 'Grupo M7-P05', DATE '2026-06-03', 0, 'CONFIGURACION')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO posicion_cuadratura(
    codigo, nombre, tipo, grupo_franco_id, perfil_rotacion_id,
    fecha_ancla, posicion_inicial_ciclo, turno_inicial, movil_inicial_id,
    desfase_dias_referencia, origen_ancla, vigencia_desde
)
SELECT x.codigo, x.nombre, x.tipo::tipo_posicion, gf.id, pr.id,
       x.fecha_ancla, 0, x.turno, m.id,
       x.desfase, 'CONFIGURACION', DATE '2026-06-01'
FROM (VALUES
    ('M6-P01', 'Posición móvil 6 P01', 'MOVIL6', 'GF-M6-P01', 'MOVIL6_FIJO', 6, DATE '2026-06-01', 'M'::turno_codigo, 0),
    ('M6-P02', 'Posición móvil 6 P02', 'MOVIL6', 'GF-M6-P02', 'MOVIL6_FIJO', 6, DATE '2026-06-01', 'T', 0),
    ('M6-P03', 'Posición móvil 6 P03', 'MOVIL6', 'GF-M6-P03', 'MOVIL6_FIJO', 6, DATE '2026-06-01', 'N', 0),
    ('M6-P04', 'Posición móvil 6 P04', 'MOVIL6', 'GF-M6-P04', 'MOVIL6_FIJO', 6, DATE '2026-06-03', 'M', 2),
    ('M6-P05', 'Posición móvil 6 P05', 'MOVIL6', 'GF-M6-P05', 'MOVIL6_FIJO', 6, DATE '2026-06-03', 'T', 2),
    ('M7-P01', 'Posición móvil 7 P01', 'MOVIL7', 'GF-M7-P01', 'MOVIL7_FIJO', 7, DATE '2026-06-01', 'M', 0),
    ('M7-P02', 'Posición móvil 7 P02', 'MOVIL7', 'GF-M7-P02', 'MOVIL7_FIJO', 7, DATE '2026-06-01', 'T', 0),
    ('M7-P03', 'Posición móvil 7 P03', 'MOVIL7', 'GF-M7-P03', 'MOVIL7_FIJO', 7, DATE '2026-06-01', 'N', 0),
    ('M7-P04', 'Posición móvil 7 P04', 'MOVIL7', 'GF-M7-P04', 'MOVIL7_FIJO', 7, DATE '2026-06-03', 'M', 2),
    ('M7-P05', 'Posición móvil 7 P05', 'MOVIL7', 'GF-M7-P05', 'MOVIL7_FIJO', 7, DATE '2026-06-03', 'T', 2)
) x(codigo, nombre, tipo, grupo_codigo, perfil_codigo, movil_num, fecha_ancla, turno, desfase)
JOIN grupo_franco gf ON gf.codigo = x.grupo_codigo
JOIN perfil_rotacion pr ON pr.codigo = x.perfil_codigo
JOIN movil m ON m.numero = x.movil_num
ON CONFLICT (codigo) DO NOTHING;

-- Inspectores titulares de la cuadratura R36 (cronograma junio 2026).
INSERT INTO inspector(legajo, nombre_completo, tipo_plantel, fecha_alta)
VALUES
('SV-R36-01', 'López J.', 'TITULAR', DATE '2026-06-01'),
('SV-R36-02', 'Scagnetti', 'TITULAR', DATE '2026-06-01'),
('SV-R36-03', 'Cingolani', 'TITULAR', DATE '2026-06-01'),
('SV-R36-04', 'Fanloo', 'TITULAR', DATE '2026-06-01'),
('SV-R36-05', 'Torres', 'TITULAR', DATE '2026-06-01'),
('SV-R36-06', 'Falco', 'TITULAR', DATE '2026-06-01'),
('SV-R36-07', 'Fernández L.', 'TITULAR', DATE '2026-06-01'),
('SV-R36-08', 'Zeballe', 'TITULAR', DATE '2026-06-01'),
('SV-R36-09', 'Coria', 'TITULAR', DATE '2026-06-01'),
('SV-R36-10', 'Coronel', 'TITULAR', DATE '2026-06-01')
ON CONFLICT (legajo) DO NOTHING;

INSERT INTO asignacion_inspector_posicion(posicion_id, inspector_id, fecha_desde, motivo)
SELECT p.id, i.id, DATE '2026-06-01', 'Alta inicial cuadratura Ruta 36'
FROM (VALUES
    ('M6-P01', 'SV-R36-01'),
    ('M6-P02', 'SV-R36-02'),
    ('M6-P03', 'SV-R36-03'),
    ('M6-P04', 'SV-R36-04'),
    ('M6-P05', 'SV-R36-05'),
    ('M7-P01', 'SV-R36-06'),
    ('M7-P02', 'SV-R36-07'),
    ('M7-P03', 'SV-R36-08'),
    ('M7-P04', 'SV-R36-09'),
    ('M7-P05', 'SV-R36-10')
) x(posicion_codigo, legajo)
JOIN posicion_cuadratura p ON p.codigo = x.posicion_codigo
JOIN inspector i ON i.legajo = x.legajo
WHERE NOT EXISTS (
    SELECT 1 FROM asignacion_inspector_posicion a
    WHERE a.posicion_id = p.id AND a.inspector_id = i.id
      AND a.fecha_desde = DATE '2026-06-01'
);

-- Estado inicial al 01/06/2026 (reproduce la hoja de junio).
-- P01–P03 / M7-P01–P03: trabajo ciclo 0.
-- P04–P05: franco ciclo 6; el turno del bloque previo queda en indice_turno
-- para que al cerrar franco avance M→N→T correctamente.
INSERT INTO estado_inicial_posicion(
    posicion_id, inicializacion_id, fecha_referencia, posicion_ciclo,
    turno, movil_id, indice_turno, indice_movil, codigo_origen
)
SELECT p.id, NULL, DATE '2026-06-01', x.ciclo,
       x.turno, CASE WHEN x.movil_num IS NULL THEN NULL ELSE m.id END,
       x.indice_turno, 0, x.codigo_origen
FROM (VALUES
    ('M6-P01', 0, 'M'::turno_codigo, 6, 0, 'M6'),
    ('M6-P02', 0, 'T', 6, 2, 'T6'),
    ('M6-P03', 0, 'N', 6, 1, 'N6'),
    ('M6-P04', 6, NULL, NULL, 2, 'F'),
    ('M6-P05', 6, NULL, NULL, 1, 'F'),
    ('M7-P01', 0, 'M', 7, 0, 'M7'),
    ('M7-P02', 0, 'T', 7, 2, 'T7'),
    ('M7-P03', 0, 'N', 7, 1, 'N7'),
    ('M7-P04', 6, NULL, NULL, 2, 'F'),
    ('M7-P05', 6, NULL, NULL, 1, 'F')
) x(posicion_codigo, ciclo, turno, movil_num, indice_turno, codigo_origen)
JOIN posicion_cuadratura p ON p.codigo = x.posicion_codigo
LEFT JOIN movil m ON m.numero = x.movil_num
ON CONFLICT (posicion_id) DO UPDATE SET
    fecha_referencia = EXCLUDED.fecha_referencia,
    posicion_ciclo = EXCLUDED.posicion_ciclo,
    turno = EXCLUDED.turno,
    movil_id = EXCLUDED.movil_id,
    indice_turno = EXCLUDED.indice_turno,
    indice_movil = EXCLUDED.indice_movil,
    codigo_origen = EXCLUDED.codigo_origen;

CREATE OR REPLACE VIEW v_ruta36_posiciones_vigentes AS
SELECT p.codigo AS posicion_codigo, p.nombre AS posicion_nombre,
       p.tipo, a.fecha_desde, a.fecha_hasta,
       i.id AS inspector_id, i.legajo, i.nombre_completo,
       m.numero AS movil,
       CASE m.numero
         WHEN 6 THEN 'Piedras Moras'
         WHEN 7 THEN 'Arroyo Tegua'
         ELSE NULL
       END AS sitio,
       b.nombre AS base_nombre
FROM posicion_cuadratura p
JOIN perfil_rotacion_movil pm ON pm.perfil_id = p.perfil_rotacion_id AND pm.orden = 1
JOIN movil m ON m.id = pm.movil_id
JOIN base_operativa b ON b.id = m.base_operativa_id
LEFT JOIN LATERAL (
    SELECT a1.* FROM asignacion_inspector_posicion a1
    WHERE a1.posicion_id = p.id AND current_date <@ a1.vigencia
    ORDER BY a1.fecha_desde DESC LIMIT 1
) a ON true
LEFT JOIN inspector i ON i.id = a.inspector_id
WHERE p.codigo LIKE 'M6-P%' OR p.codigo LIKE 'M7-P%'
  AND p.estado = 'ACTIVO';

COMMENT ON VIEW v_ruta36_posiciones_vigentes IS
'Ocupantes vigentes de las posiciones de Ruta 36 (móviles 6 y 7).';

COMMIT;
