-- V026: color de fondo y de letra por tipo de licencia.

ALTER TABLE seguridad_vial.catalogo_licencia
    ADD COLUMN IF NOT EXISTS color_fondo varchar(7),
    ADD COLUMN IF NOT EXISTS color_letra varchar(7);

COMMENT ON COLUMN seguridad_vial.catalogo_licencia.color_fondo IS
'Color de fondo (#RRGGBB) al mostrar esta licencia en la cuadratura.';
COMMENT ON COLUMN seguridad_vial.catalogo_licencia.color_letra IS
'Color de letra (#RRGGBB) al mostrar esta licencia en la cuadratura.';
