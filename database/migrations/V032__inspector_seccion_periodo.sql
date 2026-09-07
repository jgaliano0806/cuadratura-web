-- Historial de sección: un período abierto (hasta NULL) y los anteriores cerrados.
CREATE TABLE IF NOT EXISTS seguridad_vial.inspector_seccion_periodo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inspector_id uuid NOT NULL REFERENCES seguridad_vial.inspector(id),
    seccion varchar(20) NOT NULL,
    fecha_desde date NOT NULL,
    fecha_hasta date,
    vigencia daterange GENERATED ALWAYS AS (
        daterange(fecha_desde, COALESCE(fecha_hasta, 'infinity'::date), '[]')
    ) STORED,
    motivo text NOT NULL DEFAULT '',
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_insp_seccion_periodo_seccion
      CHECK (seccion IN ('MOVILES', 'EPI', 'BO')),
    CONSTRAINT ck_insp_seccion_periodo_fechas
      CHECK (fecha_hasta IS NULL OR fecha_hasta >= fecha_desde),
    EXCLUDE USING gist (inspector_id WITH =, vigencia WITH &&)
);

CREATE INDEX IF NOT EXISTS ix_insp_seccion_periodo_inspector
  ON seguridad_vial.inspector_seccion_periodo (inspector_id, fecha_desde DESC);

INSERT INTO seguridad_vial.inspector_seccion_periodo (
  inspector_id, seccion, fecha_desde, motivo
)
SELECT i.id,
       coalesce(i.seccion, 'MOVILES'),
       i.fecha_alta,
       'Situación inicial'
FROM seguridad_vial.inspector i
WHERE i.tipo_plantel <> 'PEAJISTA'
  AND NOT EXISTS (
    SELECT 1 FROM seguridad_vial.inspector_seccion_periodo p
    WHERE p.inspector_id = i.id
  );

COMMENT ON TABLE seguridad_vial.inspector_seccion_periodo IS
  'Apertura de sección por persona. El período vigente tiene fecha_hasta NULL.';
