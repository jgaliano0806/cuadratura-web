BEGIN;
SET search_path TO seguridad_vial, public;

UPDATE rol SET
  nombre = 'General',
  descripcion = 'Gestiona todo: usuarios, catálogos, cuadratura y flujo.'
WHERE codigo = 'ADMINISTRADOR_SISTEMA';

UPDATE rol SET
  descripcion = 'Opera la cuadratura y administra usuarios. El día a día de SV.'
WHERE codigo = 'ADMINISTRACION_SEGURIDAD_VIAL';

UPDATE rol SET
  descripcion = 'Aprueba, publica y edita el Real. No administra usuarios.'
WHERE codigo = 'JEFE_SECTOR';

UPDATE rol SET
  descripcion = 'Personas y catálogos de todo el plantel. No administra usuarios.'
WHERE codigo = 'RECURSOS_HUMANOS';

UPDATE rol SET
  descripcion = 'Solo consulta y trazabilidad.'
WHERE codigo = 'AUDITOR';

UPDATE rol SET
  descripcion = 'Solo lectura.'
WHERE codigo = 'CONSULTA';

COMMIT;
