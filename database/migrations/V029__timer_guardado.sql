BEGIN;
SET search_path TO seguridad_vial, public;

-- Copia cerrada del Timer: al guardar no se vuelve a editar.
CREATE TABLE timer_guardado (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha_desde date NOT NULL,
    fecha_hasta date NOT NULL,
    nota text NOT NULL DEFAULT '',
    guardado_por uuid NOT NULL REFERENCES usuario(id),
    guardado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_timer_guardado_fechas CHECK (fecha_hasta >= fecha_desde)
);

CREATE INDEX ix_timer_guardado_en ON timer_guardado (guardado_en DESC);
CREATE INDEX ix_timer_guardado_periodo ON timer_guardado (fecha_desde, fecha_hasta);

CREATE TABLE timer_guardado_fila (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guardado_id uuid NOT NULL REFERENCES timer_guardado(id) ON DELETE CASCADE,
    orden integer NOT NULL,
    fecha date NOT NULL,
    inspector_id uuid REFERENCES inspector(id),
    origen varchar(8) NOT NULL CHECK (origen IN ('auto', 'extra')),
    legajo text NOT NULL DEFAULT '',
    persona text NOT NULL,
    codigo_ideal varchar(20) NOT NULL DEFAULT '',
    codigo_real varchar(20) NOT NULL DEFAULT '',
    motivo text NOT NULL DEFAULT '',
    observacion text NOT NULL DEFAULT ''
);

CREATE INDEX ix_timer_guardado_fila ON timer_guardado_fila (guardado_id, orden);

COMMENT ON TABLE timer_guardado IS
'Timer cerrado: foto de las filas al momento de guardar. No se modifica.';

COMMIT;
