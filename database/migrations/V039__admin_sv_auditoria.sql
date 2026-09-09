BEGIN;
SET search_path TO seguridad_vial, public;

INSERT INTO rol_permiso(rol_id, permiso_id)
SELECT r.id, p.id
FROM rol r
JOIN permiso p ON p.codigo = 'AUDITORIA_CONSULTAR'
WHERE r.codigo = 'ADMINISTRACION_SEGURIDAD_VIAL'
ON CONFLICT DO NOTHING;

INSERT INTO usuario_permiso(usuario_id, permiso_id)
SELECT DISTINCT ur.usuario_id, p.id
FROM usuario_rol ur
JOIN rol r ON r.id = ur.rol_id
JOIN permiso p ON p.codigo = 'AUDITORIA_CONSULTAR'
WHERE r.codigo IN ('ADMINISTRACION_SEGURIDAD_VIAL', 'ADMINISTRADOR_SISTEMA', 'AUDITOR')
  AND (ur.fecha_hasta IS NULL OR ur.fecha_hasta >= current_date)
ON CONFLICT DO NOTHING;

COMMIT;
