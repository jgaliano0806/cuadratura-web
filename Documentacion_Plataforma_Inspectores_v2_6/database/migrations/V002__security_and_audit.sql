BEGIN;
SET search_path TO seguridad_vial, public;

CREATE TABLE usuario (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_usuario varchar(100) NOT NULL UNIQUE,
    nombre_mostrar varchar(200) NOT NULL,
    email varchar(320),
    hash_clave text,
    estado estado_registro NOT NULL DEFAULT 'ACTIVO',
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_usuario_hash CHECK (hash_clave IS NULL OR length(hash_clave) >= 20)
);

CREATE TABLE rol (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo varchar(80) NOT NULL UNIQUE,
    nombre varchar(160) NOT NULL,
    descripcion text,
    estado estado_registro NOT NULL DEFAULT 'ACTIVO'
);

CREATE TABLE permiso (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo varchar(120) NOT NULL UNIQUE,
    descripcion text NOT NULL
);

CREATE TABLE usuario_rol (
    usuario_id uuid NOT NULL REFERENCES usuario(id),
    rol_id uuid NOT NULL REFERENCES rol(id),
    fecha_desde date NOT NULL DEFAULT current_date,
    fecha_hasta date,
    PRIMARY KEY (usuario_id, rol_id, fecha_desde),
    CONSTRAINT ck_usuario_rol_fechas CHECK (fecha_hasta IS NULL OR fecha_hasta >= fecha_desde)
);

CREATE TABLE rol_permiso (
    rol_id uuid NOT NULL REFERENCES rol(id) ON DELETE CASCADE,
    permiso_id uuid NOT NULL REFERENCES permiso(id) ON DELETE CASCADE,
    PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE evento_auditoria (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ocurrido_en timestamptz NOT NULL DEFAULT clock_timestamp(),
    usuario_id uuid REFERENCES usuario(id),
    entidad varchar(120) NOT NULL,
    entidad_id text,
    accion varchar(30) NOT NULL,
    valor_anterior jsonb,
    valor_nuevo jsonb,
    motivo text,
    transaccion_id bigint NOT NULL DEFAULT txid_current(),
    ip inet,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX ix_auditoria_entidad_fecha ON evento_auditoria (entidad, ocurrido_en DESC);
CREATE INDEX ix_auditoria_usuario_fecha ON evento_auditoria (usuario_id, ocurrido_en DESC);
CREATE INDEX ix_auditoria_metadata_gin ON evento_auditoria USING gin (metadata);

CREATE OR REPLACE FUNCTION fn_usuario_contexto()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v text;
BEGIN
    v := current_setting('app.user_id', true);
    IF v IS NULL OR btrim(v) = '' THEN
        RETURN NULL;
    END IF;
    RETURN v::uuid;
EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_motivo_contexto()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.change_reason', true), '');
$$;

CREATE OR REPLACE FUNCTION fn_auditar_cambio()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_id text;
BEGIN
    v_id := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(OLD)->>'id');
    INSERT INTO evento_auditoria (
        usuario_id, entidad, entidad_id, accion,
        valor_anterior, valor_nuevo, motivo, ip
    ) VALUES (
        fn_usuario_contexto(), TG_TABLE_NAME, v_id, TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
        fn_motivo_contexto(),
        NULLIF(current_setting('app.client_ip', true), '')::inet
    );
    RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN invalid_text_representation THEN
    INSERT INTO evento_auditoria (
        usuario_id, entidad, entidad_id, accion,
        valor_anterior, valor_nuevo, motivo
    ) VALUES (
        fn_usuario_contexto(), TG_TABLE_NAME, v_id, TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
        fn_motivo_contexto()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION fn_evento_auditoria_inmutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Los eventos de auditoría son inmutables';
END;
$$;

CREATE TRIGGER trg_evento_auditoria_inmutable
BEFORE UPDATE OR DELETE ON evento_auditoria
FOR EACH ROW EXECUTE FUNCTION fn_evento_auditoria_inmutable();

COMMIT;
