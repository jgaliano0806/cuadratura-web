BEGIN;
SET search_path TO seguridad_vial, public;

INSERT INTO permiso(codigo, descripcion) VALUES
('PLANIFICACION_CREAR', 'Crear y editar borradores'),
('PLANIFICACION_ENVIAR_REVISION', 'Enviar una versión a revisión'),
('PLANIFICACION_OBSERVAR', 'Observar y devolver una versión'),
('PLANIFICACION_APROBAR_PUBLICAR', 'Aprobar y publicar en una sola acción'),
('PLANIFICACION_CERRAR', 'Cerrar un período'),
('HUECO_JUSTIFICAR', 'Registrar motivo y responsable de un hueco'),
('INICIALIZACION_EJECUTAR', 'Ejecutar la inicialización única'),
('USUARIOS_ADMINISTRAR', 'Administrar usuarios y permisos'),
('AUDITORIA_CONSULTAR', 'Consultar auditoría')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO rol(codigo, nombre, descripcion) VALUES
('ADMINISTRACION_SEGURIDAD_VIAL', 'Administración de Seguridad Vial', 'Prepara, valida y envía la cuadratura'),
('JEFE_SECTOR', 'Jefe del sector', 'Observa, aprueba/publica y cierra'),
('ADMINISTRADOR_SISTEMA', 'Administrador del sistema', 'Funciones técnicas y extraordinarias'),
('CONSULTA', 'Consulta', 'Acceso de solo lectura'),
('AUDITOR', 'Auditor', 'Consulta de trazabilidad')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO rol_permiso(rol_id, permiso_id)
SELECT r.id, p.id
FROM rol r
JOIN permiso p ON (
    (r.codigo = 'ADMINISTRACION_SEGURIDAD_VIAL' AND p.codigo IN (
        'PLANIFICACION_CREAR', 'PLANIFICACION_ENVIAR_REVISION', 'HUECO_JUSTIFICAR'
    )) OR
    (r.codigo = 'JEFE_SECTOR' AND p.codigo IN (
        'PLANIFICACION_OBSERVAR', 'PLANIFICACION_APROBAR_PUBLICAR',
        'PLANIFICACION_CERRAR', 'HUECO_JUSTIFICAR'
    )) OR
    (r.codigo = 'ADMINISTRADOR_SISTEMA' AND p.codigo IN (
        'INICIALIZACION_EJECUTAR', 'USUARIOS_ADMINISTRAR', 'AUDITORIA_CONSULTAR'
    )) OR
    (r.codigo = 'AUDITOR' AND p.codigo = 'AUDITORIA_CONSULTAR')
)
ON CONFLICT DO NOTHING;

INSERT INTO base_operativa(codigo, nombre, ubicacion_descriptiva) VALUES
('OBRADOR', 'Obrador', 'Base de los móviles 1, 2, 3 y 5'),
('RUTA53', 'Ruta 53', 'Base del móvil 4')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO movil(numero, base_operativa_id, capacidad_maxima, vigencia_desde)
SELECT n.numero, b.id, 2, DATE '2026-05-01'
FROM (VALUES (1, 'OBRADOR'), (2, 'OBRADOR'), (3, 'OBRADOR'), (4, 'RUTA53'), (5, 'OBRADOR')) n(numero, base_codigo)
JOIN base_operativa b ON b.codigo = n.base_codigo
ON CONFLICT (numero) DO NOTHING;

INSERT INTO horario_turno_movil(movil_id, turno, hora_inicio, duracion_minutos, vigencia_desde)
SELECT m.id, x.turno, x.hora_inicio, 480, DATE '2026-05-01'
FROM movil m
JOIN (VALUES
    (1, 'M'::turno_codigo, TIME '05:00'), (1, 'T', TIME '13:00'), (1, 'N', TIME '21:00'),
    (2, 'M', TIME '05:00'), (2, 'T', TIME '13:00'), (2, 'N', TIME '21:00'),
    (3, 'M', TIME '07:00'), (3, 'T', TIME '15:00'), (3, 'N', TIME '23:00'),
    (4, 'M', TIME '05:00'), (4, 'T', TIME '13:00'), (4, 'N', TIME '21:00'),
    (5, 'M', TIME '07:00'), (5, 'T', TIME '15:00'), (5, 'N', TIME '23:00')
) x(numero, turno, hora_inicio) ON x.numero = m.numero
ON CONFLICT DO NOTHING;

INSERT INTO perfil_rotacion(codigo, nombre, tipo, vigencia_desde) VALUES
('ROTACION_GENERAL', 'Rotación general 1-5-3-2', 'GENERAL', DATE '2026-05-01'),
('MOVIL4_FIJO', 'Móvil 4 con turnos M-N-T', 'FIJO_MOVIL', DATE '2026-05-01'),
('VINCULADA_EXTERNA', 'Rotación externa 5-3-2-1', 'ROTACION_ESPECIAL', DATE '2026-05-01')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO perfil_rotacion_turno(perfil_id, orden, turno)
SELECT p.id, x.orden, x.turno
FROM perfil_rotacion p
JOIN (VALUES
    ('ROTACION_GENERAL', 1, 'M'::turno_codigo),
    ('ROTACION_GENERAL', 2, 'N'),
    ('ROTACION_GENERAL', 3, 'T'),
    ('MOVIL4_FIJO', 1, 'M'),
    ('MOVIL4_FIJO', 2, 'N'),
    ('MOVIL4_FIJO', 3, 'T'),
    ('VINCULADA_EXTERNA', 1, 'M'),
    ('VINCULADA_EXTERNA', 2, 'N'),
    ('VINCULADA_EXTERNA', 3, 'T')
) x(codigo, orden, turno) ON x.codigo = p.codigo
ON CONFLICT DO NOTHING;

INSERT INTO perfil_rotacion_movil(perfil_id, orden, movil_id)
SELECT p.id, x.orden, m.id
FROM perfil_rotacion p
JOIN (VALUES
    ('ROTACION_GENERAL', 1, 1),
    ('ROTACION_GENERAL', 2, 5),
    ('ROTACION_GENERAL', 3, 3),
    ('ROTACION_GENERAL', 4, 2),
    ('MOVIL4_FIJO', 1, 4),
    ('VINCULADA_EXTERNA', 1, 5),
    ('VINCULADA_EXTERNA', 2, 3),
    ('VINCULADA_EXTERNA', 3, 2),
    ('VINCULADA_EXTERNA', 4, 1)
) x(codigo, orden, numero) ON x.codigo = p.codigo
JOIN movil m ON m.numero = x.numero
ON CONFLICT DO NOTHING;

INSERT INTO grupo_franco(codigo, nombre, fecha_ancla, posicion_inicial_ciclo, origen_ancla)
VALUES
('GF-M4-P01', 'Grupo M4-P01', DATE '2026-05-01', 0, 'HISTORICO_EXCEL'),
('GF-M4-P02', 'Grupo M4-P02', DATE '2026-05-02', 0, 'HISTORICO_EXCEL'),
('GF-M4-P03', 'Grupo M4-P03', DATE '2026-05-04', 0, 'HISTORICO_EXCEL'),
('GF-M4-P04', 'Grupo M4-P04', DATE '2026-05-05', 0, 'HISTORICO_EXCEL'),
('GF-M4-P05', 'Grupo M4-P05', DATE '2026-05-07', 0, 'HISTORICO_EXCEL')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO posicion_cuadratura(
    codigo, nombre, tipo, grupo_franco_id, perfil_rotacion_id,
    fecha_ancla, posicion_inicial_ciclo, turno_inicial, movil_inicial_id,
    desfase_dias_referencia, origen_ancla, vigencia_desde
)
SELECT x.codigo, x.nombre, 'MOVIL4', gf.id, p.id,
       x.fecha_ancla, 0, x.turno, m.id,
       x.desfase, 'HISTORICO_EXCEL', DATE '2026-05-01'
FROM (VALUES
    ('M4-P01', 'Posición móvil 4 P01', 'GF-M4-P01', DATE '2026-05-01', 'M'::turno_codigo, 0),
    ('M4-P02', 'Posición móvil 4 P02', 'GF-M4-P02', DATE '2026-05-02', 'T', 1),
    ('M4-P03', 'Posición móvil 4 P03', 'GF-M4-P03', DATE '2026-05-04', 'N', 3),
    ('M4-P04', 'Posición móvil 4 P04', 'GF-M4-P04', DATE '2026-05-05', 'M', 4),
    ('M4-P05', 'Posición móvil 4 P05', 'GF-M4-P05', DATE '2026-05-07', 'T', 6)
) x(codigo, nombre, grupo_codigo, fecha_ancla, turno, desfase)
JOIN grupo_franco gf ON gf.codigo = x.grupo_codigo
JOIN perfil_rotacion p ON p.codigo = 'MOVIL4_FIJO'
JOIN movil m ON m.numero = 4
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
