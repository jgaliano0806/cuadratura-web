-- Permitir móviles más allá del 7 (altas operativas).
ALTER TABLE seguridad_vial.movil DROP CONSTRAINT IF EXISTS movil_numero_check;
ALTER TABLE seguridad_vial.movil
    ADD CONSTRAINT movil_numero_check CHECK (numero BETWEEN 1 AND 99);
