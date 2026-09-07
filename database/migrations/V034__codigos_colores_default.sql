-- Colores canónicos del catálogo, alineados con la leyenda de cuadratura.

UPDATE seguridad_vial.catalogo_licencia
SET color_fondo = '#7a331c', color_letra = '#f8ddd0'
WHERE codigo = 'V';

UPDATE seguridad_vial.catalogo_licencia
SET color_fondo = '#3d4340', color_letra = '#e4e7e0'
WHERE codigo = 'F';

UPDATE seguridad_vial.catalogo_licencia
SET color_fondo = '#7a2424', color_letra = '#f8d4d4'
WHERE codigo = 'EF';

UPDATE seguridad_vial.catalogo_licencia
SET color_fondo = '#2f6b28', color_letra = '#e8f6df'
WHERE tipo = 'TURNO'
  AND codigo ~ '^M[0-9]*$';

UPDATE seguridad_vial.catalogo_licencia
SET color_fondo = '#8a5c10', color_letra = '#fff1c4'
WHERE tipo = 'TURNO'
  AND codigo ~ '^T[0-9]*$';

UPDATE seguridad_vial.catalogo_licencia
SET color_fondo = '#2d4480', color_letra = '#dce6fb'
WHERE tipo = 'TURNO'
  AND codigo ~ '^N[0-9]*$';

UPDATE seguridad_vial.catalogo_licencia
SET color_fondo = '#3f4a42', color_letra = '#dfe3dc'
WHERE tipo = 'AUSENCIA'
  AND codigo NOT IN ('V', 'EF')
  AND (color_fondo IS NULL OR color_fondo IN ('#000000', '#3d5348', '#454545', '#dfe3dc'));
