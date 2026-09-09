BEGIN;
SET search_path TO seguridad_vial, public;

UPDATE rol SET
  nombre = 'Administrador del sistema',
  descripcion = 'Gestiona todo: usuarios, catálogos, cuadratura y flujo.'
WHERE codigo = 'ADMINISTRADOR_SISTEMA';

UPDATE rol SET
  descripcion = 'Aprueba, publica y edita el Real. No administra usuarios. Qué ve lo definen las secciones.'
WHERE codigo = 'JEFE_SECTOR';

UPDATE rol SET
  descripcion = 'Personas y catálogos. No administra usuarios. Qué ve lo definen las secciones.'
WHERE codigo = 'RECURSOS_HUMANOS';

UPDATE rol SET
  descripcion = 'Solo consulta y trazabilidad. Qué ve lo definen las secciones.'
WHERE codigo = 'AUDITOR';

UPDATE rol SET
  descripcion = 'Solo lectura. Qué ve lo definen las secciones.'
WHERE codigo = 'CONSULTA';

INSERT INTO usuario_rol (usuario_id, rol_id, fecha_desde)
SELECT DISTINCT ur.usuario_id, sys.id, current_date
FROM usuario_rol ur
JOIN rol sv ON sv.id = ur.rol_id AND sv.codigo = 'ADMINISTRACION_SEGURIDAD_VIAL'
JOIN rol sys ON sys.codigo = 'ADMINISTRADOR_SISTEMA'
WHERE ur.fecha_hasta IS NULL OR ur.fecha_hasta >= current_date
ON CONFLICT DO NOTHING;

DELETE FROM usuario_rol ur
USING rol r
WHERE ur.rol_id = r.id
  AND r.codigo = 'ADMINISTRACION_SEGURIDAD_VIAL';

COMMIT;
