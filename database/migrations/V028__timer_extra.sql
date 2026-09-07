BEGIN;
SET search_path TO seguridad_vial, public;

-- Novedades del Timer que no cambian una celda de la Real.
CREATE TABLE timer_extra (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inspector_id uuid NOT NULL REFERENCES inspector(id),
    fecha date NOT NULL,
    motivo text NOT NULL,
    observacion text NOT NULL DEFAULT '',
    codigo_ideal varchar(20) NOT NULL DEFAULT '',
    codigo_real varchar(20) NOT NULL DEFAULT '',
    creado_por uuid NOT NULL REFERENCES usuario(id),
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_timer_extra_motivo CHECK (char_length(btrim(motivo)) >= 3)
);

CREATE INDEX ix_timer_extra_fecha ON timer_extra (fecha);
CREATE INDEX ix_timer_extra_inspector ON timer_extra (inspector_id, fecha);

COMMENT ON TABLE timer_extra IS
'Renglones agregados a mano en el Timer. No materializan la grilla Real.';

COMMIT;
