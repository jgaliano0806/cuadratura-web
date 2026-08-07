-- ======================================================================
-- V001__schema_extensions_and_types.sql
-- ======================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA IF NOT EXISTS seguridad_vial;
SET search_path TO seguridad_vial, public;

CREATE TYPE estado_registro AS ENUM ('ACTIVO', 'INACTIVO');
CREATE TYPE tipo_plantel AS ENUM ('TITULAR', 'REEMPLAZANTE');
CREATE TYPE turno_codigo AS ENUM ('M', 'T', 'N');
CREATE TYPE tipo_posicion AS ENUM ('GENERAL', 'MOVIL4', 'VINCULADA');
CREATE TYPE tipo_configuracion AS ENUM ('GENERAL', 'FIJO_MOVIL', 'ROTACION_ESPECIAL');
CREATE TYPE tipo_capa AS ENUM ('BASE', 'PLANIFICADA', 'REAL');
CREATE TYPE estado_version AS ENUM (
    'BORRADOR',
    'EN_REVISION',
    'OBSERVADA',
    'APROBADA_PUBLICADA',
    'CERRADA',
    'REEMPLAZADA'
);
CREATE TYPE tipo_bloque AS ENUM ('TRABAJO', 'FRANCO');
CREATE TYPE origen_registro AS ENUM ('IMPORTADO', 'GENERADO', 'MANUAL', 'NOVEDAD', 'REAL');
CREATE TYPE tipo_dia AS ENUM ('TRABAJO', 'FRANCO', 'VACACION', 'LICENCIA', 'ENFERMEDAD', 'HUECO');
CREATE TYPE tipo_novedad AS ENUM ('VACACION', 'LICENCIA', 'ENFERMEDAD');
CREATE TYPE estado_novedad AS ENUM ('BORRADOR', 'APROBADA', 'CANCELADA', 'CERRADA');
CREATE TYPE tipo_ajuste_plan AS ENUM (
    'APLICAR_NOVEDAD',
    'TRABAJO_DEMANDA',
    'FRANCO_ADICIONAL',
    'REEMPLAZO',
    'CAMBIO_MANUAL',
    'HUECO_ACEPTADO'
);
CREATE TYPE tipo_evento_real AS ENUM (
    'CONFIRMACION_PLAN',
    'AUSENCIA',
    'REEMPLAZO',
    'CAMBIO_MOVIL',
    'CAMBIO_TURNO',
    'HUECO',
    'CORRECCION'
);
CREATE TYPE estado_cobertura AS ENUM ('HUECO', 'CUBIERTA', 'REFORZADA');
CREATE TYPE estado_inicializacion AS ENUM ('CARGADA', 'VALIDADA', 'CONFIRMADA', 'FALLIDA', 'REVERTIDA');
CREATE TYPE rol_posicion_vinculada AS ENUM ('MOVIL4', 'MOVIL_EXTERNO');
CREATE TYPE origen_ancla AS ENUM ('HISTORICO_EXCEL', 'CONFIGURACION');
CREATE TYPE estado_materializacion AS ENUM ('INICIADA', 'COMPLETADA', 'FALLIDA');

COMMIT;

-- ======================================================================
-- V002__security_and_audit.sql
-- ======================================================================
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

-- ======================================================================
-- V003__catalogs_positions_and_initialization.sql
-- ======================================================================
BEGIN;
SET search_path TO seguridad_vial, public;

CREATE TABLE inicializacion_sistema (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    archivo_original varchar(500) NOT NULL,
    hoja_origen varchar(120) NOT NULL DEFAULT 'Móviles CBA 26-27',
    hash_sha256 char(64) NOT NULL,
    estado estado_inicializacion NOT NULL DEFAULT 'CARGADA',
    fecha_carga timestamptz NOT NULL DEFAULT now(),
    fecha_confirmacion timestamptz,
    usuario_carga_id uuid NOT NULL REFERENCES usuario(id),
    usuario_confirmacion_id uuid REFERENCES usuario(id),
    resumen_validacion jsonb NOT NULL DEFAULT '{}'::jsonb,
    es_activa boolean NOT NULL DEFAULT false,
    fecha_reversion timestamptz,
    usuario_reversion_id uuid REFERENCES usuario(id),
    motivo_reversion text,
    CONSTRAINT uq_inicializacion_hash UNIQUE (hash_sha256),
    CONSTRAINT ck_inicializacion_confirmacion CHECK (
        (estado <> 'CONFIRMADA') OR
        (fecha_confirmacion IS NOT NULL AND usuario_confirmacion_id IS NOT NULL AND es_activa)
    ),
    CONSTRAINT ck_inicializacion_reversion CHECK (
        (estado <> 'REVERTIDA') OR
        (fecha_reversion IS NOT NULL AND usuario_reversion_id IS NOT NULL AND motivo_reversion IS NOT NULL AND NOT es_activa)
    )
);

CREATE UNIQUE INDEX uq_inicializacion_activa
ON inicializacion_sistema (es_activa)
WHERE es_activa;

CREATE TABLE error_inicializacion (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inicializacion_id uuid NOT NULL REFERENCES inicializacion_sistema(id) ON DELETE CASCADE,
    fila integer,
    columna varchar(20),
    valor text,
    codigo_error varchar(80) NOT NULL,
    detalle text NOT NULL,
    severidad varchar(20) NOT NULL CHECK (severidad IN ('ADVERTENCIA', 'ERROR'))
);

CREATE TABLE base_operativa (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo varchar(40) NOT NULL UNIQUE,
    nombre varchar(160) NOT NULL,
    ubicacion_descriptiva text,
    estado estado_registro NOT NULL DEFAULT 'ACTIVO',
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE movil (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    numero smallint NOT NULL UNIQUE CHECK (numero BETWEEN 1 AND 5),
    base_operativa_id uuid NOT NULL REFERENCES base_operativa(id),
    capacidad_maxima smallint NOT NULL DEFAULT 2 CHECK (capacidad_maxima BETWEEN 1 AND 2),
    estado varchar(30) NOT NULL DEFAULT 'ACTIVO'
        CHECK (estado IN ('ACTIVO', 'MANTENIMIENTO', 'FUERA_SERVICIO', 'REEMPLAZADO')),
    vigencia_desde date NOT NULL DEFAULT current_date,
    vigencia_hasta date,
    CONSTRAINT ck_movil_vigencia CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

CREATE TABLE horario_turno_movil (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    movil_id uuid NOT NULL REFERENCES movil(id),
    turno turno_codigo NOT NULL,
    hora_inicio time NOT NULL,
    duracion_minutos smallint,
    fecha_operativa_por_inicio boolean NOT NULL DEFAULT true,
    vigencia_desde date NOT NULL,
    vigencia_hasta date,
    vigencia daterange GENERATED ALWAYS AS (
        daterange(vigencia_desde, COALESCE(vigencia_hasta, 'infinity'::date), '[]')
    ) STORED,
    CONSTRAINT ck_horario_duracion CHECK (duracion_minutos IS NULL OR duracion_minutos BETWEEN 1 AND 1440),
    CONSTRAINT ck_horario_vigencia CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde),
    EXCLUDE USING gist (movil_id WITH =, turno WITH =, vigencia WITH &&)
);

CREATE TABLE inspector (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    legajo varchar(50) NOT NULL UNIQUE,
    nombre_completo varchar(220) NOT NULL,
    tipo_plantel tipo_plantel NOT NULL DEFAULT 'TITULAR',
    estado estado_registro NOT NULL DEFAULT 'ACTIVO',
    fecha_alta date NOT NULL,
    fecha_baja date,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_inspector_fechas CHECK (fecha_baja IS NULL OR fecha_baja >= fecha_alta)
);

CREATE INDEX ix_inspector_nombre ON inspector (lower(nombre_completo));

CREATE TABLE grupo_franco (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo varchar(80) NOT NULL UNIQUE,
    nombre varchar(160) NOT NULL,
    fecha_ancla date NOT NULL,
    posicion_inicial_ciclo smallint NOT NULL DEFAULT 0 CHECK (posicion_inicial_ciclo BETWEEN 0 AND 7),
    origen_ancla origen_ancla NOT NULL,
    inicializacion_id uuid REFERENCES inicializacion_sistema(id),
    estado estado_registro NOT NULL DEFAULT 'ACTIVO'
);

CREATE TABLE perfil_rotacion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo varchar(80) NOT NULL UNIQUE,
    nombre varchar(180) NOT NULL,
    tipo tipo_configuracion NOT NULL,
    vigencia_desde date NOT NULL,
    vigencia_hasta date,
    estado estado_registro NOT NULL DEFAULT 'ACTIVO',
    CONSTRAINT ck_perfil_vigencia CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

CREATE TABLE perfil_rotacion_turno (
    perfil_id uuid NOT NULL REFERENCES perfil_rotacion(id) ON DELETE CASCADE,
    orden smallint NOT NULL CHECK (orden > 0),
    turno turno_codigo NOT NULL,
    PRIMARY KEY (perfil_id, orden),
    UNIQUE (perfil_id, turno)
);

CREATE TABLE perfil_rotacion_movil (
    perfil_id uuid NOT NULL REFERENCES perfil_rotacion(id) ON DELETE CASCADE,
    orden smallint NOT NULL CHECK (orden > 0),
    movil_id uuid NOT NULL REFERENCES movil(id),
    PRIMARY KEY (perfil_id, orden),
    UNIQUE (perfil_id, movil_id)
);

CREATE TABLE posicion_cuadratura (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo varchar(80) NOT NULL UNIQUE,
    nombre varchar(180) NOT NULL,
    tipo tipo_posicion NOT NULL,
    grupo_franco_id uuid NOT NULL REFERENCES grupo_franco(id),
    perfil_rotacion_id uuid NOT NULL REFERENCES perfil_rotacion(id),
    fecha_ancla date NOT NULL,
    posicion_inicial_ciclo smallint NOT NULL DEFAULT 0 CHECK (posicion_inicial_ciclo BETWEEN 0 AND 7),
    turno_inicial turno_codigo,
    movil_inicial_id uuid REFERENCES movil(id),
    desfase_dias_referencia smallint NOT NULL DEFAULT 0,
    origen_ancla origen_ancla NOT NULL,
    inicializacion_id uuid REFERENCES inicializacion_sistema(id),
    estado estado_registro NOT NULL DEFAULT 'ACTIVO',
    vigencia_desde date NOT NULL,
    vigencia_hasta date,
    CONSTRAINT ck_posicion_vigencia CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

CREATE TABLE asignacion_inspector_posicion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    posicion_id uuid NOT NULL REFERENCES posicion_cuadratura(id),
    inspector_id uuid NOT NULL REFERENCES inspector(id),
    fecha_desde date NOT NULL,
    fecha_hasta date,
    vigencia daterange GENERATED ALWAYS AS (
        daterange(fecha_desde, COALESCE(fecha_hasta, 'infinity'::date), '[]')
    ) STORED,
    motivo text NOT NULL,
    aprobado_por uuid REFERENCES usuario(id),
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_asignacion_posicion_fechas CHECK (fecha_hasta IS NULL OR fecha_hasta >= fecha_desde),
    EXCLUDE USING gist (posicion_id WITH =, vigencia WITH &&),
    EXCLUDE USING gist (inspector_id WITH =, vigencia WITH &&)
);

CREATE TABLE grupo_rotacion_vinculada (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo varchar(80) NOT NULL UNIQUE,
    nombre varchar(180) NOT NULL,
    perfil_movil_externo_id uuid NOT NULL REFERENCES perfil_rotacion(id),
    regla_alternancia jsonb NOT NULL,
    vigencia_desde date NOT NULL,
    vigencia_hasta date,
    estado estado_registro NOT NULL DEFAULT 'ACTIVO',
    CONSTRAINT ck_grupo_vinculado_vigencia CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

CREATE TABLE miembro_grupo_rotacion_vinculada (
    grupo_id uuid NOT NULL REFERENCES grupo_rotacion_vinculada(id) ON DELETE CASCADE,
    posicion_id uuid NOT NULL REFERENCES posicion_cuadratura(id),
    rol rol_posicion_vinculada NOT NULL,
    orden_alternancia smallint NOT NULL CHECK (orden_alternancia > 0),
    PRIMARY KEY (grupo_id, posicion_id),
    UNIQUE (grupo_id, rol)
);

CREATE TABLE registro_golden_master (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inicializacion_id uuid NOT NULL REFERENCES inicializacion_sistema(id) ON DELETE CASCADE,
    inspector_id uuid REFERENCES inspector(id),
    posicion_id uuid REFERENCES posicion_cuadratura(id),
    fecha_operativa date NOT NULL,
    codigo_esperado varchar(12) NOT NULL,
    turno_esperado turno_codigo,
    movil_esperado_id uuid REFERENCES movil(id),
    tipo_dia_esperado tipo_dia NOT NULL,
    UNIQUE (inicializacion_id, posicion_id, fecha_operativa)
);

CREATE INDEX ix_golden_master_fecha ON registro_golden_master (fecha_operativa);

COMMIT;

-- ======================================================================
-- V004__schedules_versions_blocks_and_days.sql
-- ======================================================================
BEGIN;
SET search_path TO seguridad_vial, public;

CREATE TABLE cronograma (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo varchar(100) NOT NULL UNIQUE,
    nombre varchar(220) NOT NULL,
    capa tipo_capa NOT NULL,
    periodo_desde date NOT NULL,
    periodo_hasta date NOT NULL,
    version_actual_id uuid,
    creado_por uuid NOT NULL REFERENCES usuario(id),
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_cronograma_periodo CHECK (periodo_hasta >= periodo_desde)
);

CREATE TABLE cronograma_version (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cronograma_id uuid NOT NULL REFERENCES cronograma(id),
    numero_version integer NOT NULL CHECK (numero_version > 0),
    estado estado_version NOT NULL DEFAULT 'BORRADOR',
    derivada_de_version_id uuid REFERENCES cronograma_version(id),
    version_anterior_id uuid REFERENCES cronograma_version(id),
    motivo_cambio text,
    observaciones_revision text,
    creada_por uuid NOT NULL REFERENCES usuario(id),
    creada_en timestamptz NOT NULL DEFAULT now(),
    enviada_revision_por uuid REFERENCES usuario(id),
    enviada_revision_en timestamptz,
    aprobada_publicada_por uuid REFERENCES usuario(id),
    aprobada_publicada_en timestamptz,
    cerrada_por uuid REFERENCES usuario(id),
    cerrada_en timestamptz,
    UNIQUE (cronograma_id, numero_version),
    CONSTRAINT ck_version_publicacion CHECK (
        (estado <> 'APROBADA_PUBLICADA') OR
        (aprobada_publicada_por IS NOT NULL AND aprobada_publicada_en IS NOT NULL)
    ),
    CONSTRAINT ck_version_cierre CHECK (
        (estado <> 'CERRADA') OR (cerrada_por IS NOT NULL AND cerrada_en IS NOT NULL)
    )
);

ALTER TABLE cronograma
ADD CONSTRAINT fk_cronograma_version_actual
FOREIGN KEY (version_actual_id) REFERENCES cronograma_version(id);

CREATE UNIQUE INDEX uq_version_activa_trabajo
ON cronograma_version (cronograma_id)
WHERE estado IN ('BORRADOR', 'EN_REVISION', 'OBSERVADA');

CREATE UNIQUE INDEX uq_version_publicada_actual
ON cronograma_version (cronograma_id)
WHERE estado = 'APROBADA_PUBLICADA';

CREATE INDEX ix_version_derivada ON cronograma_version (derivada_de_version_id);

CREATE TABLE version_estado_historial (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version_id uuid NOT NULL REFERENCES cronograma_version(id),
    estado_desde estado_version,
    estado_hasta estado_version NOT NULL,
    usuario_id uuid NOT NULL REFERENCES usuario(id),
    ocurrido_en timestamptz NOT NULL DEFAULT now(),
    observacion text
);

CREATE INDEX ix_historial_version_fecha ON version_estado_historial (version_id, ocurrido_en);

CREATE TABLE bloque_cuadratura (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id uuid NOT NULL REFERENCES cronograma_version(id),
    posicion_id uuid NOT NULL REFERENCES posicion_cuadratura(id),
    inspector_titular_id uuid REFERENCES inspector(id),
    secuencia bigint NOT NULL,
    tipo tipo_bloque NOT NULL,
    fecha_desde date NOT NULL,
    fecha_hasta date NOT NULL,
    periodo daterange GENERATED ALWAYS AS (daterange(fecha_desde, fecha_hasta, '[]')) STORED,
    turno turno_codigo,
    movil_id uuid REFERENCES movil(id),
    indice_turno smallint,
    indice_movil smallint,
    origen origen_registro NOT NULL,
    es_parcial boolean NOT NULL DEFAULT false,
    creado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (version_id, posicion_id, secuencia),
    CONSTRAINT ck_bloque_fechas CHECK (fecha_hasta >= fecha_desde),
    CONSTRAINT ck_bloque_contenido CHECK (
        (tipo = 'TRABAJO' AND turno IS NOT NULL AND movil_id IS NOT NULL AND inspector_titular_id IS NOT NULL) OR
        (tipo = 'FRANCO' AND turno IS NULL AND movil_id IS NULL)
    ),
    CONSTRAINT ck_bloque_duracion CHECK (
        es_parcial OR
        (tipo = 'TRABAJO' AND fecha_hasta = fecha_desde + 4) OR
        (tipo = 'FRANCO' AND fecha_hasta = fecha_desde + 2)
    ),
    EXCLUDE USING gist (version_id WITH =, posicion_id WITH =, periodo WITH &&)
);

CREATE INDEX ix_bloque_version_fecha ON bloque_cuadratura (version_id, fecha_desde, fecha_hasta);
CREATE INDEX ix_bloque_posicion_fecha ON bloque_cuadratura (posicion_id, fecha_desde);

CREATE TABLE dia_cronograma (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id uuid NOT NULL REFERENCES cronograma_version(id),
    fecha_operativa date NOT NULL,
    posicion_id uuid NOT NULL REFERENCES posicion_cuadratura(id),
    inspector_titular_id uuid REFERENCES inspector(id),
    inspector_asignado_id uuid REFERENCES inspector(id),
    tipo_dia tipo_dia NOT NULL,
    turno turno_codigo,
    movil_id uuid REFERENCES movil(id),
    codigo varchar(12) NOT NULL,
    origen origen_registro NOT NULL,
    bloque_id uuid REFERENCES bloque_cuadratura(id),
    dia_origen_id uuid REFERENCES dia_cronograma(id),
    observacion text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (version_id, posicion_id, fecha_operativa),
    CONSTRAINT ck_dia_contenido CHECK (
        (tipo_dia = 'TRABAJO' AND turno IS NOT NULL AND movil_id IS NOT NULL AND inspector_asignado_id IS NOT NULL) OR
        (tipo_dia = 'HUECO' AND turno IS NOT NULL AND movil_id IS NOT NULL AND inspector_asignado_id IS NULL) OR
        (tipo_dia IN ('FRANCO', 'VACACION', 'LICENCIA', 'ENFERMEDAD') AND turno IS NULL AND movil_id IS NULL AND inspector_asignado_id IS NULL)
    )
);

CREATE UNIQUE INDEX uq_dia_inspector_trabajo
ON dia_cronograma (version_id, inspector_asignado_id, fecha_operativa)
WHERE inspector_asignado_id IS NOT NULL AND tipo_dia = 'TRABAJO';

CREATE INDEX ix_dia_version_fecha ON dia_cronograma (version_id, fecha_operativa);
CREATE INDEX ix_dia_cobertura ON dia_cronograma (version_id, fecha_operativa, movil_id, turno)
WHERE tipo_dia = 'TRABAJO';
CREATE INDEX ix_dia_titular_fecha ON dia_cronograma (inspector_titular_id, fecha_operativa);
CREATE INDEX ix_dia_asignado_fecha ON dia_cronograma (inspector_asignado_id, fecha_operativa);

CREATE TABLE cobertura_dia (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id uuid NOT NULL REFERENCES cronograma_version(id),
    fecha_operativa date NOT NULL,
    movil_id uuid NOT NULL REFERENCES movil(id),
    turno turno_codigo NOT NULL,
    cantidad_objetivo smallint NOT NULL DEFAULT 1 CHECK (cantidad_objetivo = 1),
    capacidad_maxima smallint NOT NULL DEFAULT 2 CHECK (capacidad_maxima = 2),
    cantidad_asignada smallint NOT NULL CHECK (cantidad_asignada BETWEEN 0 AND 2),
    estado estado_cobertura NOT NULL,
    alerta_activa boolean NOT NULL,
    motivo_hueco text,
    responsable_aceptacion_id uuid REFERENCES usuario(id),
    fecha_aceptacion timestamptz,
    UNIQUE (version_id, fecha_operativa, movil_id, turno),
    CONSTRAINT ck_cobertura_estado CHECK (
        (cantidad_asignada = 0 AND estado = 'HUECO' AND alerta_activa) OR
        (cantidad_asignada = 1 AND estado = 'CUBIERTA' AND NOT alerta_activa) OR
        (cantidad_asignada = 2 AND estado = 'REFORZADA' AND NOT alerta_activa)
    ),
    CONSTRAINT ck_hueco_aceptado_completo CHECK (
        (motivo_hueco IS NULL AND responsable_aceptacion_id IS NULL AND fecha_aceptacion IS NULL) OR
        (motivo_hueco IS NOT NULL AND responsable_aceptacion_id IS NOT NULL AND fecha_aceptacion IS NOT NULL)
    )
);

CREATE INDEX ix_cobertura_huecos ON cobertura_dia (version_id, fecha_operativa)
WHERE estado = 'HUECO';

CREATE TABLE materializacion_ejecucion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id uuid NOT NULL REFERENCES cronograma_version(id),
    estado estado_materializacion NOT NULL DEFAULT 'INICIADA',
    iniciada_en timestamptz NOT NULL DEFAULT now(),
    finalizada_en timestamptz,
    filas_generadas integer,
    detalle_error text,
    ejecutada_por uuid REFERENCES usuario(id)
);

COMMIT;

-- ======================================================================
-- V005__novelties_plan_adjustments_and_real_events.sql
-- ======================================================================
BEGIN;
SET search_path TO seguridad_vial, public;

CREATE TABLE novedad_operativa (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo tipo_novedad NOT NULL,
    capa_aplicacion tipo_capa NOT NULL CHECK (capa_aplicacion IN ('PLANIFICADA', 'REAL')),
    version_registro_id uuid REFERENCES cronograma_version(id),
    inspector_id uuid NOT NULL REFERENCES inspector(id),
    fecha_desde date NOT NULL,
    fecha_hasta date,
    periodo daterange GENERATED ALWAYS AS (
        daterange(fecha_desde, COALESCE(fecha_hasta, 'infinity'::date), '[]')
    ) STORED,
    motivo text NOT NULL,
    estado estado_novedad NOT NULL DEFAULT 'BORRADOR',
    creada_por uuid NOT NULL REFERENCES usuario(id),
    creada_en timestamptz NOT NULL DEFAULT now(),
    aprobada_por uuid REFERENCES usuario(id),
    aprobada_en timestamptz,
    cerrada_en timestamptz,
    CONSTRAINT ck_novedad_fechas CHECK (fecha_hasta IS NULL OR fecha_hasta >= fecha_desde),
    CONSTRAINT ck_vacacion_fin CHECK (tipo <> 'VACACION' OR fecha_hasta IS NOT NULL),
    CONSTRAINT ck_novedad_aprobacion CHECK (
        estado NOT IN ('APROBADA', 'CERRADA') OR
        (aprobada_por IS NOT NULL AND aprobada_en IS NOT NULL AND version_registro_id IS NOT NULL)
    ),
    EXCLUDE USING gist (inspector_id WITH =, periodo WITH &&)
        WHERE (estado IN ('APROBADA', 'CERRADA'))
);

CREATE INDEX ix_novedad_inspector_periodo ON novedad_operativa USING gist (inspector_id, periodo);
CREATE INDEX ix_novedad_version ON novedad_operativa (version_registro_id);

CREATE TABLE vacacion_detalle (
    novedad_id uuid PRIMARY KEY REFERENCES novedad_operativa(id) ON DELETE CASCADE,
    cantidad_dias smallint NOT NULL CHECK (cantidad_dias IN (7, 14, 21, 28, 35)),
    dias_corridos boolean NOT NULL DEFAULT true CHECK (dias_corridos),
    francos_previos smallint NOT NULL DEFAULT 3 CHECK (francos_previos = 3),
    cantidad_trabajos_demanda smallint NOT NULL CHECK (cantidad_trabajos_demanda BETWEEN 0 AND 2),
    franco_posterior smallint NOT NULL DEFAULT 1 CHECK (franco_posterior = 1),
    CONSTRAINT ck_vacacion_trabajos CHECK (
        (cantidad_dias = 7 AND cantidad_trabajos_demanda = 0) OR
        (cantidad_dias IN (14, 28) AND cantidad_trabajos_demanda = 1) OR
        (cantidad_dias IN (21, 35) AND cantidad_trabajos_demanda = 2)
    )
);

CREATE TABLE reemplazo_novedad (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    novedad_id uuid NOT NULL REFERENCES novedad_operativa(id),
    posicion_id uuid NOT NULL REFERENCES posicion_cuadratura(id),
    inspector_titular_id uuid NOT NULL REFERENCES inspector(id),
    inspector_reemplazante_id uuid NOT NULL REFERENCES inspector(id),
    fecha_desde date NOT NULL,
    fecha_hasta date NOT NULL,
    periodo daterange GENERATED ALWAYS AS (daterange(fecha_desde, fecha_hasta, '[]')) STORED,
    motivo text NOT NULL,
    aprobado_por uuid NOT NULL REFERENCES usuario(id),
    aprobado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_reemplazo_personas CHECK (inspector_titular_id <> inspector_reemplazante_id),
    CONSTRAINT ck_reemplazo_fechas CHECK (fecha_hasta >= fecha_desde),
    EXCLUDE USING gist (inspector_reemplazante_id WITH =, periodo WITH &&)
);

CREATE TABLE ajuste_planificacion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id uuid NOT NULL REFERENCES cronograma_version(id),
    ajuste_reemplazado_id uuid REFERENCES ajuste_planificacion(id),
    tipo tipo_ajuste_plan NOT NULL,
    prioridad integer NOT NULL DEFAULT 100,
    fecha_desde date NOT NULL,
    fecha_hasta date NOT NULL,
    posicion_id uuid REFERENCES posicion_cuadratura(id),
    inspector_titular_id uuid REFERENCES inspector(id),
    inspector_asignado_id uuid REFERENCES inspector(id),
    tipo_dia_resultante tipo_dia,
    turno_resultante turno_codigo,
    movil_resultante_id uuid REFERENCES movil(id),
    codigo_resultante varchar(12),
    novedad_id uuid REFERENCES novedad_operativa(id),
    motivo text NOT NULL,
    creado_por uuid NOT NULL REFERENCES usuario(id),
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_ajuste_fechas CHECK (fecha_hasta >= fecha_desde),
    CONSTRAINT ck_ajuste_objetivo CHECK (posicion_id IS NOT NULL OR inspector_titular_id IS NOT NULL),
    CONSTRAINT ck_ajuste_reemplazo CHECK (tipo <> 'REEMPLAZO' OR inspector_asignado_id IS NOT NULL),
    CONSTRAINT ck_ajuste_demanda CHECK (
        tipo <> 'TRABAJO_DEMANDA' OR
        (turno_resultante IS NOT NULL AND movil_resultante_id IS NOT NULL)
    ),
    CONSTRAINT ck_ajuste_hueco CHECK (
        tipo <> 'HUECO_ACEPTADO' OR
        (turno_resultante IS NOT NULL AND movil_resultante_id IS NOT NULL)
    ),
    CONSTRAINT ck_ajuste_manual_codigo CHECK (
        tipo <> 'CAMBIO_MANUAL' OR codigo_resultante IS NOT NULL
    )
);

CREATE INDEX ix_ajuste_version_prioridad ON ajuste_planificacion (version_id, prioridad, creado_en);
CREATE INDEX ix_ajuste_periodo ON ajuste_planificacion (version_id, fecha_desde, fecha_hasta);

CREATE TABLE evento_real (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id uuid NOT NULL REFERENCES cronograma_version(id),
    tipo tipo_evento_real NOT NULL,
    fecha_operativa date NOT NULL,
    posicion_id uuid NOT NULL REFERENCES posicion_cuadratura(id),
    inspector_titular_id uuid REFERENCES inspector(id),
    inspector_asignado_id uuid REFERENCES inspector(id),
    tipo_dia_resultante tipo_dia,
    turno_resultante turno_codigo,
    movil_resultante_id uuid REFERENCES movil(id),
    codigo_resultante varchar(12),
    novedad_id uuid REFERENCES novedad_operativa(id),
    evento_reemplazado_id uuid REFERENCES evento_real(id),
    motivo text NOT NULL,
    creado_por uuid NOT NULL REFERENCES usuario(id),
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_evento_reemplazo CHECK (tipo <> 'REEMPLAZO' OR inspector_asignado_id IS NOT NULL),
    CONSTRAINT ck_evento_hueco CHECK (tipo <> 'HUECO' OR inspector_asignado_id IS NULL),
    CONSTRAINT ck_evento_cambio_codigo CHECK (
        tipo NOT IN ('CAMBIO_MOVIL', 'CAMBIO_TURNO', 'CORRECCION') OR codigo_resultante IS NOT NULL
    )
);

CREATE INDEX ix_evento_real_version_fecha ON evento_real (version_id, fecha_operativa, creado_en);
CREATE INDEX ix_evento_real_posicion_fecha ON evento_real (posicion_id, fecha_operativa);

ALTER TABLE dia_cronograma
    ADD COLUMN novedad_id uuid REFERENCES novedad_operativa(id),
    ADD COLUMN ajuste_planificacion_id uuid REFERENCES ajuste_planificacion(id),
    ADD COLUMN evento_real_id uuid REFERENCES evento_real(id);

COMMIT;

-- ======================================================================
-- V006__integrity_triggers_and_audit.sql
-- ======================================================================
BEGIN;
SET search_path TO seguridad_vial, public;

CREATE OR REPLACE FUNCTION fn_capa_version(p_version_id uuid)
RETURNS tipo_capa
LANGUAGE sql
STABLE
AS $$
    SELECT c.capa
    FROM cronograma_version v
    JOIN cronograma c ON c.id = v.cronograma_id
    WHERE v.id = p_version_id;
$$;

CREATE OR REPLACE FUNCTION fn_version_editable(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT estado IN ('BORRADOR', 'OBSERVADA')
    FROM cronograma_version
    WHERE id = p_version_id;
$$;

CREATE OR REPLACE FUNCTION fn_exigir_version_editable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_version uuid;
BEGIN
    v_version := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
    IF NOT COALESCE(fn_version_editable(v_version), false) THEN
        RAISE EXCEPTION 'La versión % no es editable', v_version;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION fn_validar_derivacion_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_capa tipo_capa;
    v_capa_origen tipo_capa;
    v_estado_origen estado_version;
BEGIN
    SELECT capa INTO v_capa FROM cronograma WHERE id = NEW.cronograma_id;

    IF NEW.version_anterior_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM cronograma_version anterior
            WHERE anterior.id = NEW.version_anterior_id
              AND anterior.cronograma_id = NEW.cronograma_id
              AND anterior.numero_version < NEW.numero_version
        ) THEN
            RAISE EXCEPTION 'La versión anterior debe pertenecer al mismo cronograma y tener un número menor';
        END IF;
    END IF;

    IF v_capa = 'BASE' THEN
        IF NEW.derivada_de_version_id IS NOT NULL THEN
            RAISE EXCEPTION 'Una versión BASE no puede derivar de otra capa';
        END IF;
    ELSE
        IF NEW.derivada_de_version_id IS NULL THEN
            RAISE EXCEPTION 'Las versiones % requieren una versión origen', v_capa;
        END IF;
        SELECT fn_capa_version(NEW.derivada_de_version_id), estado
        INTO v_capa_origen, v_estado_origen
        FROM cronograma_version
        WHERE id = NEW.derivada_de_version_id;

        IF v_capa = 'PLANIFICADA' AND v_capa_origen <> 'BASE' THEN
            RAISE EXCEPTION 'PLANIFICADA debe derivar de BASE';
        END IF;
        IF v_capa = 'REAL' AND v_capa_origen <> 'PLANIFICADA' THEN
            RAISE EXCEPTION 'REAL debe derivar de PLANIFICADA';
        END IF;
        IF v_estado_origen NOT IN ('APROBADA_PUBLICADA', 'CERRADA', 'REEMPLAZADA') THEN
            RAISE EXCEPTION 'La versión origen debe estar publicada o cerrada';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_derivacion_version
BEFORE INSERT OR UPDATE OF derivada_de_version_id, version_anterior_id, cronograma_id, numero_version
ON cronograma_version
FOR EACH ROW EXECUTE FUNCTION fn_validar_derivacion_version();

CREATE OR REPLACE FUNCTION fn_validar_transicion_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.estado = OLD.estado THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.estado = 'BORRADOR' AND NEW.estado = 'EN_REVISION') OR
        (OLD.estado = 'BORRADOR' AND NEW.estado = 'CERRADA' AND fn_capa_version(OLD.id) = 'REAL') OR
        (OLD.estado = 'EN_REVISION' AND NEW.estado IN ('OBSERVADA', 'APROBADA_PUBLICADA')) OR
        (OLD.estado = 'OBSERVADA' AND NEW.estado IN ('BORRADOR', 'EN_REVISION')) OR
        (OLD.estado = 'APROBADA_PUBLICADA' AND NEW.estado IN ('REEMPLAZADA', 'CERRADA'))
    ) THEN
        RAISE EXCEPTION 'Transición de versión no permitida: % -> %', OLD.estado, NEW.estado;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_transicion_version
BEFORE UPDATE OF estado ON cronograma_version
FOR EACH ROW EXECUTE FUNCTION fn_validar_transicion_version();

CREATE OR REPLACE FUNCTION fn_no_eliminar_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Las versiones no se eliminan; se reemplazan o cierran';
END;
$$;

CREATE TRIGGER trg_no_eliminar_version
BEFORE DELETE ON cronograma_version
FOR EACH ROW EXECUTE FUNCTION fn_no_eliminar_version();

CREATE OR REPLACE FUNCTION fn_validar_capa_hijo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_capa tipo_capa;
BEGIN
    v_capa := fn_capa_version(NEW.version_id);
    IF TG_TABLE_NAME = 'bloque_cuadratura' AND v_capa <> 'BASE' THEN
        RAISE EXCEPTION 'Los bloques canónicos solo pertenecen a BASE';
    ELSIF TG_TABLE_NAME = 'ajuste_planificacion' AND v_capa <> 'PLANIFICADA' THEN
        RAISE EXCEPTION 'Los ajustes solo pertenecen a PLANIFICADA';
    ELSIF TG_TABLE_NAME = 'evento_real' AND v_capa <> 'REAL' THEN
        RAISE EXCEPTION 'Los eventos solo pertenecen a REAL';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bloque_capa
BEFORE INSERT OR UPDATE OF version_id ON bloque_cuadratura
FOR EACH ROW EXECUTE FUNCTION fn_validar_capa_hijo();

CREATE TRIGGER trg_ajuste_capa
BEFORE INSERT OR UPDATE OF version_id ON ajuste_planificacion
FOR EACH ROW EXECUTE FUNCTION fn_validar_capa_hijo();

CREATE TRIGGER trg_evento_capa
BEFORE INSERT OR UPDATE OF version_id ON evento_real
FOR EACH ROW EXECUTE FUNCTION fn_validar_capa_hijo();

CREATE OR REPLACE FUNCTION fn_validar_dia_asignable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer;
    v_fecha_alta date;
    v_fecha_baja date;
    v_estado_inspector estado_registro;
    v_estado_movil varchar(30);
    v_desde_movil date;
    v_hasta_movil date;
BEGIN
    IF NEW.tipo_dia = 'TRABAJO' THEN
        SELECT fecha_alta, fecha_baja, estado
        INTO v_fecha_alta, v_fecha_baja, v_estado_inspector
        FROM inspector WHERE id = NEW.inspector_asignado_id;

        IF v_estado_inspector <> 'ACTIVO'
           OR NEW.fecha_operativa < v_fecha_alta
           OR (v_fecha_baja IS NOT NULL AND NEW.fecha_operativa > v_fecha_baja) THEN
            RAISE EXCEPTION 'Inspector no disponible en %', NEW.fecha_operativa;
        END IF;

        SELECT estado, vigencia_desde, vigencia_hasta
        INTO v_estado_movil, v_desde_movil, v_hasta_movil
        FROM movil WHERE id = NEW.movil_id;

        IF v_estado_movil <> 'ACTIVO'
           OR NEW.fecha_operativa < v_desde_movil
           OR (v_hasta_movil IS NOT NULL AND NEW.fecha_operativa > v_hasta_movil) THEN
            RAISE EXCEPTION 'Móvil no disponible en %', NEW.fecha_operativa;
        END IF;

        IF current_setting('app.materializing', true) IS DISTINCT FROM 'on'
           AND EXISTS (
            SELECT 1
            FROM novedad_operativa n
            WHERE n.inspector_id = NEW.inspector_asignado_id
              AND n.estado IN ('APROBADA', 'CERRADA')
              AND NEW.fecha_operativa <@ n.periodo
        ) THEN
            RAISE EXCEPTION 'El inspector posee una novedad vigente en %', NEW.fecha_operativa;
        END IF;

        SELECT count(*) INTO v_count
        FROM dia_cronograma d
        WHERE d.version_id = NEW.version_id
          AND d.fecha_operativa = NEW.fecha_operativa
          AND d.movil_id = NEW.movil_id
          AND d.turno = NEW.turno
          AND d.tipo_dia = 'TRABAJO'
          AND d.inspector_asignado_id IS NOT NULL
          AND d.id <> NEW.id;

        IF v_count >= 2 THEN
            RAISE EXCEPTION 'Capacidad máxima de dos inspectores superada';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_dia_asignable
BEFORE INSERT OR UPDATE ON dia_cronograma
FOR EACH ROW EXECUTE FUNCTION fn_validar_dia_asignable();


CREATE OR REPLACE FUNCTION fn_validar_capa_novedad()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_capa tipo_capa;
BEGIN
    IF NEW.version_registro_id IS NOT NULL THEN
        v_capa := fn_capa_version(NEW.version_registro_id);
        IF v_capa <> NEW.capa_aplicacion THEN
            RAISE EXCEPTION 'La capa de la novedad no coincide con la versión asociada';
        END IF;
        IF v_capa = 'BASE' THEN
            RAISE EXCEPTION 'Las novedades no se aplican a BASE';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_capa_novedad
BEFORE INSERT OR UPDATE OF version_registro_id, capa_aplicacion
ON novedad_operativa
FOR EACH ROW EXECUTE FUNCTION fn_validar_capa_novedad();

CREATE OR REPLACE FUNCTION fn_validar_vacacion_detalle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_tipo tipo_novedad;
    v_desde date;
    v_hasta date;
BEGIN
    SELECT tipo, fecha_desde, fecha_hasta
    INTO v_tipo, v_desde, v_hasta
    FROM novedad_operativa WHERE id = NEW.novedad_id;

    IF v_tipo <> 'VACACION' THEN
        RAISE EXCEPTION 'vacacion_detalle requiere una novedad VACACION';
    END IF;
    IF v_hasta <> v_desde + (NEW.cantidad_dias - 1) THEN
        RAISE EXCEPTION 'El rango de vacaciones no coincide con % días corridos', NEW.cantidad_dias;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_vacacion_detalle
BEFORE INSERT OR UPDATE ON vacacion_detalle
FOR EACH ROW EXECUTE FUNCTION fn_validar_vacacion_detalle();

CREATE OR REPLACE FUNCTION fn_evento_real_inmutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Los eventos reales son append-only; registre una corrección nueva';
END;
$$;

CREATE TRIGGER trg_evento_real_inmutable
BEFORE UPDATE OR DELETE ON evento_real
FOR EACH ROW EXECUTE FUNCTION fn_evento_real_inmutable();

CREATE TRIGGER trg_bloque_version_editable
BEFORE INSERT OR UPDATE OR DELETE ON bloque_cuadratura
FOR EACH ROW EXECUTE FUNCTION fn_exigir_version_editable();

CREATE TRIGGER trg_dia_version_editable
BEFORE INSERT OR UPDATE OR DELETE ON dia_cronograma
FOR EACH ROW EXECUTE FUNCTION fn_exigir_version_editable();

CREATE TRIGGER trg_cobertura_version_editable
BEFORE INSERT OR UPDATE OR DELETE ON cobertura_dia
FOR EACH ROW EXECUTE FUNCTION fn_exigir_version_editable();

CREATE TRIGGER trg_ajuste_version_editable
BEFORE INSERT OR UPDATE OR DELETE ON ajuste_planificacion
FOR EACH ROW EXECUTE FUNCTION fn_exigir_version_editable();

CREATE TRIGGER trg_audit_version
AFTER INSERT OR UPDATE ON cronograma_version
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_posicion
AFTER INSERT OR UPDATE OR DELETE ON posicion_cuadratura
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_asignacion_posicion
AFTER INSERT OR UPDATE OR DELETE ON asignacion_inspector_posicion
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_novedad
AFTER INSERT OR UPDATE OR DELETE ON novedad_operativa
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_ajuste
AFTER INSERT OR UPDATE OR DELETE ON ajuste_planificacion
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_cobertura
AFTER UPDATE OF motivo_hueco, responsable_aceptacion_id, fecha_aceptacion ON cobertura_dia
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();
CREATE TRIGGER trg_audit_inicializacion
AFTER INSERT OR UPDATE ON inicializacion_sistema
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();

COMMIT;

-- ======================================================================
-- V007__materialization_procedures.sql
-- ======================================================================
BEGIN;
SET search_path TO seguridad_vial, public;

CREATE OR REPLACE FUNCTION fn_codigo_dia(
    p_tipo tipo_dia,
    p_turno turno_codigo,
    p_numero_movil smallint
)
RETURNS varchar
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_tipo
        WHEN 'TRABAJO' THEN p_turno::text || p_numero_movil::text
        WHEN 'FRANCO' THEN 'F'
        WHEN 'VACACION' THEN 'V'
        WHEN 'ENFERMEDAD' THEN 'EF'
        WHEN 'LICENCIA' THEN 'LIC'
        WHEN 'HUECO' THEN 'H'
    END::varchar;
$$;

CREATE OR REPLACE PROCEDURE sp_refrescar_cobertura(p_version_id uuid)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT fn_version_editable(p_version_id) THEN
        RAISE EXCEPTION 'La versión no es editable';
    END IF;

    INSERT INTO cobertura_dia (
        version_id, fecha_operativa, movil_id, turno,
        cantidad_objetivo, capacidad_maxima, cantidad_asignada,
        estado, alerta_activa
    )
    SELECT
        p_version_id,
        f.fecha::date,
        m.id,
        t.turno,
        1,
        2,
        COALESCE(a.cantidad, 0)::smallint,
        CASE COALESCE(a.cantidad, 0)
            WHEN 0 THEN 'HUECO'::estado_cobertura
            WHEN 1 THEN 'CUBIERTA'::estado_cobertura
            ELSE 'REFORZADA'::estado_cobertura
        END,
        COALESCE(a.cantidad, 0) = 0
    FROM cronograma_version v
    JOIN cronograma c ON c.id = v.cronograma_id
    CROSS JOIN LATERAL generate_series(c.periodo_desde, c.periodo_hasta, interval '1 day') f(fecha)
    JOIN movil m
      ON m.estado = 'ACTIVO'
     AND f.fecha::date >= m.vigencia_desde
     AND (m.vigencia_hasta IS NULL OR f.fecha::date <= m.vigencia_hasta)
    CROSS JOIN (VALUES ('M'::turno_codigo), ('T'::turno_codigo), ('N'::turno_codigo)) t(turno)
    LEFT JOIN LATERAL (
        SELECT count(*)::integer AS cantidad
        FROM dia_cronograma d
        WHERE d.version_id = p_version_id
          AND d.fecha_operativa = f.fecha::date
          AND d.movil_id = m.id
          AND d.turno = t.turno
          AND d.tipo_dia = 'TRABAJO'
          AND d.inspector_asignado_id IS NOT NULL
    ) a ON true
    WHERE v.id = p_version_id
    ON CONFLICT (version_id, fecha_operativa, movil_id, turno)
    DO UPDATE SET
        cantidad_asignada = EXCLUDED.cantidad_asignada,
        estado = EXCLUDED.estado,
        alerta_activa = EXCLUDED.alerta_activa,
        motivo_hueco = CASE WHEN EXCLUDED.estado = 'HUECO' THEN cobertura_dia.motivo_hueco ELSE NULL END,
        responsable_aceptacion_id = CASE WHEN EXCLUDED.estado = 'HUECO' THEN cobertura_dia.responsable_aceptacion_id ELSE NULL END,
        fecha_aceptacion = CASE WHEN EXCLUDED.estado = 'HUECO' THEN cobertura_dia.fecha_aceptacion ELSE NULL END;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_materializar_base(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ejecucion uuid;
    v_filas integer;
BEGIN
    IF fn_capa_version(p_version_id) <> 'BASE' THEN
        RAISE EXCEPTION 'La versión no pertenece a BASE';
    END IF;
    IF NOT fn_version_editable(p_version_id) THEN
        RAISE EXCEPTION 'La versión no es editable';
    END IF;

    PERFORM set_config('app.materializing', 'on', true);

    INSERT INTO materializacion_ejecucion(version_id, ejecutada_por)
    VALUES (p_version_id, p_usuario_id)
    RETURNING id INTO v_ejecucion;

    DELETE FROM cobertura_dia WHERE version_id = p_version_id;
    DELETE FROM dia_cronograma WHERE version_id = p_version_id;

    INSERT INTO dia_cronograma (
        version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        origen, bloque_id
    )
    SELECT
        b.version_id,
        gs.fecha::date,
        b.posicion_id,
        b.inspector_titular_id,
        CASE WHEN b.tipo = 'TRABAJO' THEN b.inspector_titular_id END,
        CASE WHEN b.tipo = 'TRABAJO' THEN 'TRABAJO'::tipo_dia ELSE 'FRANCO'::tipo_dia END,
        b.turno,
        b.movil_id,
        CASE WHEN b.tipo = 'TRABAJO'
             THEN fn_codigo_dia('TRABAJO', b.turno, m.numero)
             ELSE 'F'
        END,
        b.origen,
        b.id
    FROM bloque_cuadratura b
    CROSS JOIN LATERAL generate_series(b.fecha_desde, b.fecha_hasta, interval '1 day') gs(fecha)
    LEFT JOIN movil m ON m.id = b.movil_id
    WHERE b.version_id = p_version_id;

    GET DIAGNOSTICS v_filas = ROW_COUNT;
    CALL sp_refrescar_cobertura(p_version_id);

    PERFORM set_config('app.materializing', 'off', true);

    UPDATE materializacion_ejecucion
    SET estado = 'COMPLETADA', finalizada_en = now(), filas_generadas = v_filas
    WHERE id = v_ejecucion;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.materializing', 'off', true);
    IF v_ejecucion IS NOT NULL THEN
        UPDATE materializacion_ejecucion
        SET estado = 'FALLIDA', finalizada_en = now(), detalle_error = SQLERRM
        WHERE id = v_ejecucion;
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_materializar_planificada(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_origen uuid;
    v_ejecucion uuid;
    v_filas integer;
    a ajuste_planificacion%ROWTYPE;
    v_tipo_novedad tipo_novedad;
    v_tipo_resultante tipo_dia;
    v_codigo varchar(12);
    v_numero smallint;
BEGIN
    IF fn_capa_version(p_version_id) <> 'PLANIFICADA' THEN
        RAISE EXCEPTION 'La versión no pertenece a PLANIFICADA';
    END IF;
    IF NOT fn_version_editable(p_version_id) THEN
        RAISE EXCEPTION 'La versión no es editable';
    END IF;

    SELECT derivada_de_version_id INTO v_origen
    FROM cronograma_version WHERE id = p_version_id;

    PERFORM set_config('app.materializing', 'on', true);

    INSERT INTO materializacion_ejecucion(version_id, ejecutada_por)
    VALUES (p_version_id, p_usuario_id)
    RETURNING id INTO v_ejecucion;

    DELETE FROM cobertura_dia WHERE version_id = p_version_id;
    DELETE FROM dia_cronograma WHERE version_id = p_version_id;

    INSERT INTO dia_cronograma (
        version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        origen, dia_origen_id, bloque_id
    )
    SELECT
        p_version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        'GENERADO', id, bloque_id
    FROM dia_cronograma
    WHERE version_id = v_origen;

    FOR a IN
        WITH RECURSIVE cadena AS (
            SELECT id, version_anterior_id, 0 AS profundidad
            FROM cronograma_version WHERE id = p_version_id
            UNION ALL
            SELECT v.id, v.version_anterior_id, c.profundidad + 1
            FROM cronograma_version v
            JOIN cadena c ON c.version_anterior_id = v.id
        )
        SELECT a.*
        FROM cadena c
        JOIN ajuste_planificacion a ON a.version_id = c.id
        WHERE NOT EXISTS (
            SELECT 1
            FROM cadena c2
            JOIN ajuste_planificacion reemplazo ON reemplazo.version_id = c2.id
            WHERE reemplazo.ajuste_reemplazado_id = a.id
        )
        ORDER BY c.profundidad DESC, a.prioridad, a.creado_en, a.id
    LOOP
        IF a.tipo = 'APLICAR_NOVEDAD' THEN
            SELECT tipo INTO v_tipo_novedad
            FROM novedad_operativa
            WHERE id = a.novedad_id AND estado IN ('APROBADA', 'CERRADA');

            IF v_tipo_novedad IS NULL THEN
                RAISE EXCEPTION 'Ajuste % requiere una novedad aprobada', a.id;
            END IF;

            v_tipo_resultante := CASE v_tipo_novedad
                WHEN 'VACACION' THEN 'VACACION'::tipo_dia
                WHEN 'LICENCIA' THEN 'LICENCIA'::tipo_dia
                WHEN 'ENFERMEDAD' THEN 'ENFERMEDAD'::tipo_dia
            END;

            UPDATE dia_cronograma d
            SET tipo_dia = v_tipo_resultante,
                inspector_asignado_id = NULL,
                turno = NULL,
                movil_id = NULL,
                codigo = fn_codigo_dia(v_tipo_resultante, NULL, NULL),
                origen = 'NOVEDAD',
                novedad_id = a.novedad_id,
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);

        ELSIF a.tipo = 'TRABAJO_DEMANDA' THEN
            SELECT numero INTO v_numero FROM movil WHERE id = a.movil_resultante_id;
            UPDATE dia_cronograma d
            SET tipo_dia = 'TRABAJO',
                inspector_asignado_id = COALESCE(a.inspector_asignado_id, d.inspector_titular_id),
                turno = a.turno_resultante,
                movil_id = a.movil_resultante_id,
                codigo = fn_codigo_dia('TRABAJO', a.turno_resultante, v_numero),
                origen = 'NOVEDAD',
                novedad_id = a.novedad_id,
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);

        ELSIF a.tipo = 'FRANCO_ADICIONAL' THEN
            UPDATE dia_cronograma d
            SET tipo_dia = 'FRANCO',
                inspector_asignado_id = NULL,
                turno = NULL,
                movil_id = NULL,
                codigo = 'F',
                origen = 'NOVEDAD',
                novedad_id = a.novedad_id,
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);

        ELSIF a.tipo = 'REEMPLAZO' THEN
            UPDATE dia_cronograma d
            SET inspector_asignado_id = a.inspector_asignado_id,
                origen = 'NOVEDAD',
                novedad_id = a.novedad_id,
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.tipo_dia = 'TRABAJO'
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);

        ELSIF a.tipo = 'HUECO_ACEPTADO' THEN
            UPDATE dia_cronograma d
            SET tipo_dia = 'HUECO',
                inspector_asignado_id = NULL,
                turno = COALESCE(a.turno_resultante, d.turno),
                movil_id = COALESCE(a.movil_resultante_id, d.movil_id),
                codigo = 'H',
                origen = 'MANUAL',
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);

        ELSIF a.tipo = 'CAMBIO_MANUAL' THEN
            v_tipo_resultante := COALESCE(a.tipo_dia_resultante, 'TRABAJO');
            IF a.movil_resultante_id IS NOT NULL THEN
                SELECT numero INTO v_numero FROM movil WHERE id = a.movil_resultante_id;
            ELSE
                v_numero := NULL;
            END IF;
            v_codigo := COALESCE(
                a.codigo_resultante,
                fn_codigo_dia(v_tipo_resultante, a.turno_resultante, v_numero)
            );
            UPDATE dia_cronograma d
            SET tipo_dia = v_tipo_resultante,
                inspector_asignado_id = CASE
                    WHEN v_tipo_resultante = 'TRABAJO' THEN COALESCE(a.inspector_asignado_id, d.inspector_asignado_id, d.inspector_titular_id)
                    ELSE NULL
                END,
                turno = CASE WHEN v_tipo_resultante IN ('TRABAJO', 'HUECO') THEN COALESCE(a.turno_resultante, d.turno) END,
                movil_id = CASE WHEN v_tipo_resultante IN ('TRABAJO', 'HUECO') THEN COALESCE(a.movil_resultante_id, d.movil_id) END,
                codigo = v_codigo,
                origen = 'MANUAL',
                ajuste_planificacion_id = a.id,
                observacion = a.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa BETWEEN a.fecha_desde AND a.fecha_hasta
              AND (a.posicion_id IS NULL OR d.posicion_id = a.posicion_id)
              AND (a.inspector_titular_id IS NULL OR d.inspector_titular_id = a.inspector_titular_id);
        END IF;
    END LOOP;

    SELECT count(*) INTO v_filas FROM dia_cronograma WHERE version_id = p_version_id;
    CALL sp_refrescar_cobertura(p_version_id);

    PERFORM set_config('app.materializing', 'off', true);

    UPDATE materializacion_ejecucion
    SET estado = 'COMPLETADA', finalizada_en = now(), filas_generadas = v_filas
    WHERE id = v_ejecucion;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.materializing', 'off', true);
    IF v_ejecucion IS NOT NULL THEN
        UPDATE materializacion_ejecucion
        SET estado = 'FALLIDA', finalizada_en = now(), detalle_error = SQLERRM
        WHERE id = v_ejecucion;
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_materializar_real(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_origen uuid;
    v_ejecucion uuid;
    v_filas integer;
    e evento_real%ROWTYPE;
    v_tipo_novedad tipo_novedad;
    v_tipo_resultante tipo_dia;
    v_numero smallint;
BEGIN
    IF fn_capa_version(p_version_id) <> 'REAL' THEN
        RAISE EXCEPTION 'La versión no pertenece a REAL';
    END IF;
    IF NOT fn_version_editable(p_version_id) THEN
        RAISE EXCEPTION 'La versión no es editable';
    END IF;

    SELECT derivada_de_version_id INTO v_origen
    FROM cronograma_version WHERE id = p_version_id;

    PERFORM set_config('app.materializing', 'on', true);

    INSERT INTO materializacion_ejecucion(version_id, ejecutada_por)
    VALUES (p_version_id, p_usuario_id)
    RETURNING id INTO v_ejecucion;

    DELETE FROM cobertura_dia WHERE version_id = p_version_id;
    DELETE FROM dia_cronograma WHERE version_id = p_version_id;

    INSERT INTO dia_cronograma (
        version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        origen, dia_origen_id, bloque_id
    )
    SELECT
        p_version_id, fecha_operativa, posicion_id,
        inspector_titular_id, inspector_asignado_id,
        tipo_dia, turno, movil_id, codigo,
        'REAL', id, bloque_id
    FROM dia_cronograma
    WHERE version_id = v_origen;

    FOR e IN
        WITH RECURSIVE cadena AS (
            SELECT id, version_anterior_id, 0 AS profundidad
            FROM cronograma_version WHERE id = p_version_id
            UNION ALL
            SELECT v.id, v.version_anterior_id, c.profundidad + 1
            FROM cronograma_version v
            JOIN cadena c ON c.version_anterior_id = v.id
        )
        SELECT e.*
        FROM cadena c
        JOIN evento_real e ON e.version_id = c.id
        WHERE NOT EXISTS (
            SELECT 1
            FROM cadena c2
            JOIN evento_real reemplazo ON reemplazo.version_id = c2.id
            WHERE reemplazo.evento_reemplazado_id = e.id
        )
        ORDER BY c.profundidad DESC, e.creado_en, e.id
    LOOP
        IF e.tipo = 'CONFIRMACION_PLAN' THEN
            UPDATE dia_cronograma d
            SET evento_real_id = e.id,
                observacion = e.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa = e.fecha_operativa
              AND d.posicion_id = e.posicion_id;

        ELSIF e.tipo = 'AUSENCIA' THEN
            SELECT tipo INTO v_tipo_novedad FROM novedad_operativa WHERE id = e.novedad_id;
            v_tipo_resultante := CASE v_tipo_novedad
                WHEN 'VACACION' THEN 'VACACION'::tipo_dia
                WHEN 'LICENCIA' THEN 'LICENCIA'::tipo_dia
                ELSE 'ENFERMEDAD'::tipo_dia
            END;
            UPDATE dia_cronograma d
            SET tipo_dia = v_tipo_resultante,
                inspector_asignado_id = NULL,
                turno = NULL,
                movil_id = NULL,
                codigo = fn_codigo_dia(v_tipo_resultante, NULL, NULL),
                novedad_id = e.novedad_id,
                evento_real_id = e.id,
                observacion = e.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa = e.fecha_operativa
              AND d.posicion_id = e.posicion_id;

        ELSIF e.tipo = 'REEMPLAZO' THEN
            UPDATE dia_cronograma d
            SET tipo_dia = 'TRABAJO',
                inspector_asignado_id = e.inspector_asignado_id,
                turno = COALESCE(e.turno_resultante, d.turno),
                movil_id = COALESCE(e.movil_resultante_id, d.movil_id),
                codigo = COALESCE(e.codigo_resultante, d.codigo),
                novedad_id = e.novedad_id,
                evento_real_id = e.id,
                observacion = e.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa = e.fecha_operativa
              AND d.posicion_id = e.posicion_id;

        ELSIF e.tipo = 'HUECO' THEN
            UPDATE dia_cronograma d
            SET tipo_dia = 'HUECO',
                inspector_asignado_id = NULL,
                turno = COALESCE(e.turno_resultante, d.turno),
                movil_id = COALESCE(e.movil_resultante_id, d.movil_id),
                codigo = 'H',
                novedad_id = e.novedad_id,
                evento_real_id = e.id,
                observacion = e.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa = e.fecha_operativa
              AND d.posicion_id = e.posicion_id;

        ELSE
            IF e.movil_resultante_id IS NOT NULL THEN
                SELECT numero INTO v_numero FROM movil WHERE id = e.movil_resultante_id;
            ELSE
                v_numero := NULL;
            END IF;
            v_tipo_resultante := COALESCE(e.tipo_dia_resultante, 'TRABAJO');
            UPDATE dia_cronograma d
            SET tipo_dia = v_tipo_resultante,
                inspector_asignado_id = CASE
                    WHEN v_tipo_resultante = 'TRABAJO' THEN COALESCE(e.inspector_asignado_id, d.inspector_asignado_id)
                    ELSE NULL
                END,
                turno = CASE WHEN v_tipo_resultante IN ('TRABAJO', 'HUECO') THEN COALESCE(e.turno_resultante, d.turno) END,
                movil_id = CASE WHEN v_tipo_resultante IN ('TRABAJO', 'HUECO') THEN COALESCE(e.movil_resultante_id, d.movil_id) END,
                codigo = COALESCE(e.codigo_resultante, fn_codigo_dia(v_tipo_resultante, e.turno_resultante, v_numero), d.codigo),
                novedad_id = e.novedad_id,
                evento_real_id = e.id,
                observacion = e.motivo
            WHERE d.version_id = p_version_id
              AND d.fecha_operativa = e.fecha_operativa
              AND d.posicion_id = e.posicion_id;
        END IF;
    END LOOP;

    SELECT count(*) INTO v_filas FROM dia_cronograma WHERE version_id = p_version_id;
    CALL sp_refrescar_cobertura(p_version_id);

    PERFORM set_config('app.materializing', 'off', true);

    UPDATE materializacion_ejecucion
    SET estado = 'COMPLETADA', finalizada_en = now(), filas_generadas = v_filas
    WHERE id = v_ejecucion;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.materializing', 'off', true);
    IF v_ejecucion IS NOT NULL THEN
        UPDATE materializacion_ejecucion
        SET estado = 'FALLIDA', finalizada_en = now(), detalle_error = SQLERRM
        WHERE id = v_ejecucion;
    END IF;
    RAISE;
END;
$$;

COMMIT;

-- ======================================================================
-- V008__validation_and_workflow.sql
-- ======================================================================
BEGIN;
SET search_path TO seguridad_vial, public;

CREATE OR REPLACE FUNCTION fn_usuario_tiene_rol(p_usuario_id uuid, p_codigo_rol varchar)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM usuario_rol ur
        JOIN rol r ON r.id = ur.rol_id
        WHERE ur.usuario_id = p_usuario_id
          AND r.codigo = p_codigo_rol
          AND r.estado = 'ACTIVO'
          AND current_date >= ur.fecha_desde
          AND (ur.fecha_hasta IS NULL OR current_date <= ur.fecha_hasta)
    );
$$;

CREATE OR REPLACE FUNCTION fn_validar_version(p_version_id uuid)
RETURNS TABLE (
    codigo varchar,
    severidad varchar,
    detalle text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 'SIN_MATERIALIZACION'::varchar, 'ERROR'::varchar,
           'La versión no tiene días materializados'::text
    WHERE NOT EXISTS (SELECT 1 FROM dia_cronograma WHERE version_id = p_version_id);

    RETURN QUERY
    SELECT 'HUECO_SIN_JUSTIFICAR'::varchar, 'ERROR'::varchar,
           format('Hueco sin motivo/responsable: %s móvil %s turno %s',
                  c.fecha_operativa, m.numero, c.turno)::text
    FROM cobertura_dia c
    JOIN movil m ON m.id = c.movil_id
    WHERE c.version_id = p_version_id
      AND c.estado = 'HUECO'
      AND (c.motivo_hueco IS NULL OR c.responsable_aceptacion_id IS NULL);

    RETURN QUERY
    SELECT 'ASIGNACION_DURANTE_NOVEDAD'::varchar, 'ERROR'::varchar,
           format('Inspector %s asignado durante una novedad el %s', i.nombre_completo, d.fecha_operativa)::text
    FROM dia_cronograma d
    JOIN inspector i ON i.id = d.inspector_asignado_id
    JOIN novedad_operativa n
      ON n.inspector_id = d.inspector_asignado_id
     AND n.estado IN ('APROBADA', 'CERRADA')
     AND d.fecha_operativa <@ n.periodo
    WHERE d.version_id = p_version_id
      AND d.tipo_dia = 'TRABAJO';

    RETURN QUERY
    SELECT 'VACACION_TRABAJOS_DEMANDA'::varchar, 'ERROR'::varchar,
           format('La vacación %s requiere %s trabajos a demanda y posee %s',
                  v.novedad_id, v.cantidad_trabajos_demanda, count(a.id))::text
    FROM vacacion_detalle v
    JOIN novedad_operativa n ON n.id = v.novedad_id
    LEFT JOIN ajuste_planificacion a
      ON a.novedad_id = v.novedad_id
     AND a.version_id = p_version_id
     AND a.tipo = 'TRABAJO_DEMANDA'
    WHERE n.version_registro_id = p_version_id
      AND n.estado IN ('APROBADA', 'CERRADA')
    GROUP BY v.novedad_id, v.cantidad_trabajos_demanda
    HAVING count(a.id) <> v.cantidad_trabajos_demanda;

    RETURN QUERY
    SELECT 'VACACION_FRANCO_POSTERIOR'::varchar, 'ERROR'::varchar,
           format('La vacación %s debe poseer un franco posterior', v.novedad_id)::text
    FROM vacacion_detalle v
    JOIN novedad_operativa n ON n.id = v.novedad_id
    WHERE n.version_registro_id = p_version_id
      AND n.estado IN ('APROBADA', 'CERRADA')
      AND NOT EXISTS (
          SELECT 1 FROM ajuste_planificacion a
          WHERE a.version_id = p_version_id
            AND a.novedad_id = v.novedad_id
            AND a.tipo = 'FRANCO_ADICIONAL'
      );
END;
$$;

CREATE OR REPLACE PROCEDURE sp_justificar_hueco(
    p_cobertura_id uuid,
    p_motivo text,
    p_usuario_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT (fn_usuario_tiene_rol(p_usuario_id, 'ADMINISTRACION_SEGURIDAD_VIAL')
            OR fn_usuario_tiene_rol(p_usuario_id, 'JEFE_SECTOR')) THEN
        RAISE EXCEPTION 'El usuario no puede justificar huecos';
    END IF;
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'El motivo es obligatorio';
    END IF;

    UPDATE cobertura_dia
    SET motivo_hueco = p_motivo,
        responsable_aceptacion_id = p_usuario_id,
        fecha_aceptacion = now()
    WHERE id = p_cobertura_id
      AND estado = 'HUECO';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró un hueco editable';
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_enviar_revision(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_estado estado_version;
BEGIN
    IF NOT fn_usuario_tiene_rol(p_usuario_id, 'ADMINISTRACION_SEGURIDAD_VIAL') THEN
        RAISE EXCEPTION 'Solo Administración de Seguridad Vial puede enviar a revisión';
    END IF;
    IF fn_capa_version(p_version_id) <> 'PLANIFICADA' THEN
        RAISE EXCEPTION 'El flujo de aprobación corresponde a PLANIFICADA';
    END IF;
    SELECT estado INTO v_estado FROM cronograma_version WHERE id = p_version_id FOR UPDATE;
    IF v_estado NOT IN ('BORRADOR', 'OBSERVADA') THEN
        RAISE EXCEPTION 'Estado inválido para enviar a revisión: %', v_estado;
    END IF;
    IF EXISTS (
        SELECT 1 FROM fn_validar_version(p_version_id)
        WHERE severidad = 'ERROR' AND codigo <> 'HUECO_SIN_JUSTIFICAR'
    ) THEN
        RAISE EXCEPTION 'La versión posee errores estructurales de validación';
    END IF;

    UPDATE cronograma_version
    SET estado = 'EN_REVISION',
        enviada_revision_por = p_usuario_id,
        enviada_revision_en = now()
    WHERE id = p_version_id;

    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
    VALUES (p_version_id, v_estado, 'EN_REVISION', p_usuario_id);
END;
$$;

CREATE OR REPLACE PROCEDURE sp_observar_version(
    p_version_id uuid,
    p_observacion text,
    p_usuario_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT fn_usuario_tiene_rol(p_usuario_id, 'JEFE_SECTOR') THEN
        RAISE EXCEPTION 'Solo el Jefe del sector puede observar';
    END IF;
    IF p_observacion IS NULL OR btrim(p_observacion) = '' THEN
        RAISE EXCEPTION 'La observación es obligatoria';
    END IF;

    UPDATE cronograma_version
    SET estado = 'OBSERVADA', observaciones_revision = p_observacion
    WHERE id = p_version_id AND estado = 'EN_REVISION';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La versión no está en revisión';
    END IF;

    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id, observacion)
    VALUES (p_version_id, 'EN_REVISION', 'OBSERVADA', p_usuario_id, p_observacion);
END;
$$;

CREATE OR REPLACE PROCEDURE sp_reabrir_observada(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT fn_usuario_tiene_rol(p_usuario_id, 'ADMINISTRACION_SEGURIDAD_VIAL') THEN
        RAISE EXCEPTION 'Solo Administración de Seguridad Vial puede reabrir';
    END IF;
    UPDATE cronograma_version SET estado = 'BORRADOR'
    WHERE id = p_version_id AND estado = 'OBSERVADA';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La versión no está observada';
    END IF;
    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
    VALUES (p_version_id, 'OBSERVADA', 'BORRADOR', p_usuario_id);
END;
$$;

CREATE OR REPLACE PROCEDURE sp_aprobar_publicar_version(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cronograma_id uuid;
    v_version_publicada uuid;
BEGIN
    IF NOT fn_usuario_tiene_rol(p_usuario_id, 'JEFE_SECTOR') THEN
        RAISE EXCEPTION 'Solo el Jefe del sector puede aprobar y publicar';
    END IF;
    IF fn_capa_version(p_version_id) <> 'PLANIFICADA' THEN
        RAISE EXCEPTION 'Solo una versión PLANIFICADA utiliza este flujo';
    END IF;

    SELECT cronograma_id INTO v_cronograma_id
    FROM cronograma_version
    WHERE id = p_version_id AND estado = 'EN_REVISION'
    FOR UPDATE;
    IF v_cronograma_id IS NULL THEN
        RAISE EXCEPTION 'La versión no está en revisión';
    END IF;

    IF EXISTS (
        SELECT 1 FROM cronograma_version
        WHERE id = p_version_id
          AND (creada_por = p_usuario_id OR enviada_revision_por = p_usuario_id)
    ) THEN
        RAISE EXCEPTION 'Separación de funciones: quien preparó o envió la versión no puede aprobarla';
    END IF;

    IF EXISTS (SELECT 1 FROM fn_validar_version(p_version_id) WHERE severidad = 'ERROR') THEN
        RAISE EXCEPTION 'La versión posee errores de validación';
    END IF;

    SELECT id INTO v_version_publicada
    FROM cronograma_version
    WHERE cronograma_id = v_cronograma_id
      AND estado = 'APROBADA_PUBLICADA'
    FOR UPDATE;

    IF v_version_publicada IS NOT NULL THEN
        UPDATE cronograma_version
        SET estado = 'REEMPLAZADA'
        WHERE id = v_version_publicada;
        INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
        VALUES (v_version_publicada, 'APROBADA_PUBLICADA', 'REEMPLAZADA', p_usuario_id);
    END IF;

    UPDATE cronograma_version
    SET estado = 'APROBADA_PUBLICADA',
        aprobada_publicada_por = p_usuario_id,
        aprobada_publicada_en = now()
    WHERE id = p_version_id;

    UPDATE cronograma SET version_actual_id = p_version_id WHERE id = v_cronograma_id;

    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
    VALUES (p_version_id, 'EN_REVISION', 'APROBADA_PUBLICADA', p_usuario_id);
END;
$$;

CREATE OR REPLACE PROCEDURE sp_cerrar_version(p_version_id uuid, p_usuario_id uuid)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT fn_usuario_tiene_rol(p_usuario_id, 'JEFE_SECTOR') THEN
        RAISE EXCEPTION 'Solo el Jefe del sector puede cerrar';
    END IF;
    IF fn_capa_version(p_version_id) = 'REAL' THEN
        UPDATE cronograma_version
        SET estado = 'CERRADA', cerrada_por = p_usuario_id, cerrada_en = now()
        WHERE id = p_version_id AND estado = 'BORRADOR';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La versión REAL no está abierta';
        END IF;
        INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
        VALUES (p_version_id, 'BORRADOR', 'CERRADA', p_usuario_id);
    ELSE
        UPDATE cronograma_version
        SET estado = 'CERRADA', cerrada_por = p_usuario_id, cerrada_en = now()
        WHERE id = p_version_id AND estado = 'APROBADA_PUBLICADA';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La versión no está publicada';
        END IF;
        INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id)
        VALUES (p_version_id, 'APROBADA_PUBLICADA', 'CERRADA', p_usuario_id);
    END IF;
END;
$$;

COMMIT;

-- ======================================================================
-- V009__seed_catalogs_profiles_roles_and_mobile4.sql
-- ======================================================================
BEGIN;
SET search_path TO seguridad_vial, public;

INSERT INTO permiso(codigo, descripcion) VALUES
('PLANIFICACION_CREAR', 'Crear y editar borradores'),
('PLANIFICACION_ENVIAR_REVISION', 'Enviar una versión a revisión'),
('PLANIFICACION_OBSERVAR', 'Observar y devolver una versión'),
('PLANIFICACION_APROBAR_PUBLICAR', 'Aprobar y publicar en una sola acción'),
('PLANIFICACION_CERRAR', 'Cerrar un período'),
('HUECO_JUSTIFICAR', 'Registrar motivo y responsable de un hueco'),
('INICIALIZACION_EJECUTAR', 'Ejecutar la inicialización única'),
('USUARIOS_ADMINISTRAR', 'Administrar usuarios y permisos'),
('AUDITORIA_CONSULTAR', 'Consultar auditoría')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO rol(codigo, nombre, descripcion) VALUES
('ADMINISTRACION_SEGURIDAD_VIAL', 'Administración de Seguridad Vial', 'Prepara, valida y envía la cuadratura'),
('JEFE_SECTOR', 'Jefe del sector', 'Observa, aprueba/publica y cierra'),
('ADMINISTRADOR_SISTEMA', 'Administrador del sistema', 'Funciones técnicas y extraordinarias'),
('CONSULTA', 'Consulta', 'Acceso de solo lectura'),
('AUDITOR', 'Auditor', 'Consulta de trazabilidad')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO rol_permiso(rol_id, permiso_id)
SELECT r.id, p.id
FROM rol r
JOIN permiso p ON (
    (r.codigo = 'ADMINISTRACION_SEGURIDAD_VIAL' AND p.codigo IN (
        'PLANIFICACION_CREAR', 'PLANIFICACION_ENVIAR_REVISION', 'HUECO_JUSTIFICAR'
    )) OR
    (r.codigo = 'JEFE_SECTOR' AND p.codigo IN (
        'PLANIFICACION_OBSERVAR', 'PLANIFICACION_APROBAR_PUBLICAR',
        'PLANIFICACION_CERRAR', 'HUECO_JUSTIFICAR'
    )) OR
    (r.codigo = 'ADMINISTRADOR_SISTEMA' AND p.codigo IN (
        'INICIALIZACION_EJECUTAR', 'USUARIOS_ADMINISTRAR', 'AUDITORIA_CONSULTAR'
    )) OR
    (r.codigo = 'AUDITOR' AND p.codigo = 'AUDITORIA_CONSULTAR')
)
ON CONFLICT DO NOTHING;

INSERT INTO base_operativa(codigo, nombre, ubicacion_descriptiva) VALUES
('OBRADOR', 'Obrador', 'Base de los móviles 1, 2, 3 y 5'),
('RUTA53', 'Ruta 53', 'Base del móvil 4')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO movil(numero, base_operativa_id, capacidad_maxima, vigencia_desde)
SELECT n.numero, b.id, 2, DATE '2026-05-01'
FROM (VALUES (1, 'OBRADOR'), (2, 'OBRADOR'), (3, 'OBRADOR'), (4, 'RUTA53'), (5, 'OBRADOR')) n(numero, base_codigo)
JOIN base_operativa b ON b.codigo = n.base_codigo
ON CONFLICT (numero) DO NOTHING;

INSERT INTO horario_turno_movil(movil_id, turno, hora_inicio, duracion_minutos, vigencia_desde)
SELECT m.id, x.turno, x.hora_inicio, 480, DATE '2026-05-01'
FROM movil m
JOIN (VALUES
    (1, 'M'::turno_codigo, TIME '05:00'), (1, 'T', TIME '13:00'), (1, 'N', TIME '21:00'),
    (2, 'M', TIME '05:00'), (2, 'T', TIME '13:00'), (2, 'N', TIME '21:00'),
    (3, 'M', TIME '07:00'), (3, 'T', TIME '15:00'), (3, 'N', TIME '23:00'),
    (4, 'M', TIME '05:00'), (4, 'T', TIME '13:00'), (4, 'N', TIME '21:00'),
    (5, 'M', TIME '07:00'), (5, 'T', TIME '15:00'), (5, 'N', TIME '23:00')
) x(numero, turno, hora_inicio) ON x.numero = m.numero
ON CONFLICT DO NOTHING;

INSERT INTO perfil_rotacion(codigo, nombre, tipo, vigencia_desde) VALUES
('ROTACION_GENERAL', 'Rotación general 1-5-3-2', 'GENERAL', DATE '2026-05-01'),
('MOVIL4_FIJO', 'Móvil 4 con turnos M-N-T', 'FIJO_MOVIL', DATE '2026-05-01'),
('VINCULADA_EXTERNA', 'Rotación externa 5-3-2-1', 'ROTACION_ESPECIAL', DATE '2026-05-01')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO perfil_rotacion_turno(perfil_id, orden, turno)
SELECT p.id, x.orden, x.turno
FROM perfil_rotacion p
JOIN (VALUES
    ('ROTACION_GENERAL', 1, 'M'::turno_codigo),
    ('ROTACION_GENERAL', 2, 'N'),
    ('ROTACION_GENERAL', 3, 'T'),
    ('MOVIL4_FIJO', 1, 'M'),
    ('MOVIL4_FIJO', 2, 'N'),
    ('MOVIL4_FIJO', 3, 'T'),
    ('VINCULADA_EXTERNA', 1, 'M'),
    ('VINCULADA_EXTERNA', 2, 'N'),
    ('VINCULADA_EXTERNA', 3, 'T')
) x(codigo, orden, turno) ON x.codigo = p.codigo
ON CONFLICT DO NOTHING;

INSERT INTO perfil_rotacion_movil(perfil_id, orden, movil_id)
SELECT p.id, x.orden, m.id
FROM perfil_rotacion p
JOIN (VALUES
    ('ROTACION_GENERAL', 1, 1),
    ('ROTACION_GENERAL', 2, 5),
    ('ROTACION_GENERAL', 3, 3),
    ('ROTACION_GENERAL', 4, 2),
    ('MOVIL4_FIJO', 1, 4),
    ('VINCULADA_EXTERNA', 1, 5),
    ('VINCULADA_EXTERNA', 2, 3),
    ('VINCULADA_EXTERNA', 3, 2),
    ('VINCULADA_EXTERNA', 4, 1)
) x(codigo, orden, numero) ON x.codigo = p.codigo
JOIN movil m ON m.numero = x.numero
ON CONFLICT DO NOTHING;

INSERT INTO grupo_franco(codigo, nombre, fecha_ancla, posicion_inicial_ciclo, origen_ancla)
VALUES
('GF-M4-P01', 'Grupo M4-P01', DATE '2026-05-01', 0, 'HISTORICO_EXCEL'),
('GF-M4-P02', 'Grupo M4-P02', DATE '2026-05-02', 0, 'HISTORICO_EXCEL'),
('GF-M4-P03', 'Grupo M4-P03', DATE '2026-05-04', 0, 'HISTORICO_EXCEL'),
('GF-M4-P04', 'Grupo M4-P04', DATE '2026-05-05', 0, 'HISTORICO_EXCEL'),
('GF-M4-P05', 'Grupo M4-P05', DATE '2026-05-07', 0, 'HISTORICO_EXCEL')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO posicion_cuadratura(
    codigo, nombre, tipo, grupo_franco_id, perfil_rotacion_id,
    fecha_ancla, posicion_inicial_ciclo, turno_inicial, movil_inicial_id,
    desfase_dias_referencia, origen_ancla, vigencia_desde
)
SELECT x.codigo, x.nombre, 'MOVIL4', gf.id, p.id,
       x.fecha_ancla, 0, x.turno, m.id,
       x.desfase, 'HISTORICO_EXCEL', DATE '2026-05-01'
FROM (VALUES
    ('M4-P01', 'Posición móvil 4 P01', 'GF-M4-P01', DATE '2026-05-01', 'M'::turno_codigo, 0),
    ('M4-P02', 'Posición móvil 4 P02', 'GF-M4-P02', DATE '2026-05-02', 'T', 1),
    ('M4-P03', 'Posición móvil 4 P03', 'GF-M4-P03', DATE '2026-05-04', 'N', 3),
    ('M4-P04', 'Posición móvil 4 P04', 'GF-M4-P04', DATE '2026-05-05', 'M', 4),
    ('M4-P05', 'Posición móvil 4 P05', 'GF-M4-P05', DATE '2026-05-07', 'T', 6)
) x(codigo, nombre, grupo_codigo, fecha_ancla, turno, desfase)
JOIN grupo_franco gf ON gf.codigo = x.grupo_codigo
JOIN perfil_rotacion p ON p.codigo = 'MOVIL4_FIJO'
JOIN movil m ON m.numero = 4
ON CONFLICT (codigo) DO NOTHING;

COMMIT;

-- ======================================================================
-- V010__views_and_reporting.sql
-- ======================================================================
BEGIN;
SET search_path TO seguridad_vial, public;

CREATE OR REPLACE VIEW v_version_actual AS
SELECT c.id AS cronograma_id, c.codigo, c.nombre, c.capa,
       c.periodo_desde, c.periodo_hasta,
       v.id AS version_id, v.numero_version, v.estado,
       v.derivada_de_version_id,
       v.aprobada_publicada_en, v.cerrada_en
FROM cronograma c
JOIN cronograma_version v ON v.id = c.version_actual_id;

CREATE OR REPLACE VIEW v_base_actual AS
SELECT d.*, c.codigo AS cronograma_codigo
FROM v_version_actual va
JOIN cronograma c ON c.id = va.cronograma_id
JOIN dia_cronograma d ON d.version_id = va.version_id
WHERE va.capa = 'BASE';

CREATE OR REPLACE VIEW v_planificada_actual AS
SELECT d.*, c.codigo AS cronograma_codigo
FROM v_version_actual va
JOIN cronograma c ON c.id = va.cronograma_id
JOIN dia_cronograma d ON d.version_id = va.version_id
WHERE va.capa = 'PLANIFICADA';

CREATE OR REPLACE VIEW v_real_actual AS
SELECT d.*, c.codigo AS cronograma_codigo
FROM v_version_actual va
JOIN cronograma c ON c.id = va.cronograma_id
JOIN dia_cronograma d ON d.version_id = va.version_id
WHERE va.capa = 'REAL';

CREATE OR REPLACE VIEW v_huecos_actuales AS
SELECT
    c.codigo AS cronograma_codigo,
    v.numero_version,
    cd.fecha_operativa,
    m.numero AS movil,
    cd.turno,
    cd.motivo_hueco,
    u.nombre_mostrar AS responsable,
    cd.fecha_aceptacion
FROM cobertura_dia cd
JOIN cronograma_version v ON v.id = cd.version_id
JOIN cronograma c ON c.id = v.cronograma_id
JOIN movil m ON m.id = cd.movil_id
LEFT JOIN usuario u ON u.id = cd.responsable_aceptacion_id
WHERE cd.estado = 'HUECO';

CREATE OR REPLACE VIEW v_comparacion_plan_real AS
SELECT
    r.version_id AS version_real_id,
    r.fecha_operativa,
    r.posicion_id,
    p.inspector_asignado_id AS inspector_planificado_id,
    r.inspector_asignado_id AS inspector_real_id,
    p.tipo_dia AS tipo_dia_planificado,
    r.tipo_dia AS tipo_dia_real,
    p.turno AS turno_planificado,
    r.turno AS turno_real,
    p.movil_id AS movil_planificado_id,
    r.movil_id AS movil_real_id,
    (p.inspector_asignado_id, p.tipo_dia, p.turno, p.movil_id)
        IS DISTINCT FROM
    (r.inspector_asignado_id, r.tipo_dia, r.turno, r.movil_id) AS tiene_desvio,
    r.observacion AS motivo_desvio
FROM dia_cronograma r
JOIN cronograma_version vr ON vr.id = r.version_id
JOIN cronograma cr ON cr.id = vr.cronograma_id AND cr.capa = 'REAL'
JOIN dia_cronograma p ON p.id = r.dia_origen_id;

CREATE OR REPLACE VIEW v_resumen_version AS
WITH dias AS (
    SELECT
        version_id,
        count(*) AS dias_materializados,
        count(*) FILTER (WHERE tipo_dia = 'TRABAJO') AS asignaciones_trabajo,
        count(*) FILTER (WHERE tipo_dia = 'VACACION') AS dias_vacacion,
        count(*) FILTER (WHERE tipo_dia = 'LICENCIA') AS dias_licencia,
        count(*) FILTER (WHERE tipo_dia = 'ENFERMEDAD') AS dias_enfermedad,
        count(*) FILTER (WHERE tipo_dia = 'HUECO') AS filas_hueco
    FROM dia_cronograma
    GROUP BY version_id
), coberturas AS (
    SELECT
        version_id,
        count(*) FILTER (WHERE estado = 'HUECO') AS coberturas_hueco
    FROM cobertura_dia
    GROUP BY version_id
)
SELECT
    c.id AS cronograma_id,
    c.codigo,
    c.capa,
    v.id AS version_id,
    v.numero_version,
    v.estado,
    COALESCE(d.dias_materializados, 0) AS dias_materializados,
    COALESCE(d.asignaciones_trabajo, 0) AS asignaciones_trabajo,
    COALESCE(d.dias_vacacion, 0) AS dias_vacacion,
    COALESCE(d.dias_licencia, 0) AS dias_licencia,
    COALESCE(d.dias_enfermedad, 0) AS dias_enfermedad,
    COALESCE(d.filas_hueco, 0) AS filas_hueco,
    COALESCE(co.coberturas_hueco, 0) AS coberturas_hueco
FROM cronograma c
JOIN cronograma_version v ON v.cronograma_id = c.id
LEFT JOIN dias d ON d.version_id = v.id
LEFT JOIN coberturas co ON co.version_id = v.id;

COMMIT;

-- ======================================================================
-- V011__excel_initializer_and_operational_functions.sql
-- ======================================================================
BEGIN;
SET search_path TO seguridad_vial, public;

-- ------------------------------------------------------------------
-- Horarios cerrados funcionalmente: 8 horas y fecha por inicio.
-- ------------------------------------------------------------------
UPDATE horario_turno_movil
SET duracion_minutos = 480,
    fecha_operativa_por_inicio = true
WHERE duracion_minutos IS DISTINCT FROM 480
   OR fecha_operativa_por_inicio IS DISTINCT FROM true;

ALTER TABLE horario_turno_movil
    ALTER COLUMN duracion_minutos SET NOT NULL,
    ADD CONSTRAINT ck_horario_duracion_ocho_horas CHECK (duracion_minutos = 480),
    ADD CONSTRAINT ck_horario_fecha_por_inicio CHECK (fecha_operativa_por_inicio);

-- ------------------------------------------------------------------
-- Trazabilidad de lo creado por la inicialización única.
-- ------------------------------------------------------------------
ALTER TABLE inspector
    ADD COLUMN inicializacion_id uuid REFERENCES inicializacion_sistema(id);
ALTER TABLE cronograma
    ADD COLUMN inicializacion_id uuid REFERENCES inicializacion_sistema(id);
ALTER TABLE asignacion_inspector_posicion
    ADD COLUMN inicializacion_id uuid REFERENCES inicializacion_sistema(id);
ALTER TABLE grupo_rotacion_vinculada
    ADD COLUMN inicializacion_id uuid REFERENCES inicializacion_sistema(id);

CREATE INDEX ix_inspector_inicializacion ON inspector(inicializacion_id);
CREATE INDEX ix_cronograma_inicializacion ON cronograma(inicializacion_id);
CREATE INDEX ix_asignacion_posicion_inicializacion ON asignacion_inspector_posicion(inicializacion_id);

-- ------------------------------------------------------------------
-- Staging exacto del Excel. No modifica datos operativos durante preview.
-- ------------------------------------------------------------------
CREATE TABLE inicializacion_inspector_staging (
    inicializacion_id uuid NOT NULL REFERENCES inicializacion_sistema(id) ON DELETE CASCADE,
    ordinal smallint NOT NULL,
    fila_origen integer NOT NULL,
    legajo varchar(50) NOT NULL,
    nombre_origen varchar(220) NOT NULL,
    nombre_normalizado varchar(220) NOT NULL,
    nombre_clave varchar(220) NOT NULL,
    posicion_codigo varchar(80) NOT NULL,
    posicion_tipo tipo_posicion NOT NULL,
    grupo_franco_codigo varchar(80) NOT NULL,
    perfil_codigo varchar(80) NOT NULL,
    fecha_ancla date NOT NULL,
    posicion_inicial_ciclo smallint NOT NULL CHECK (posicion_inicial_ciclo BETWEEN 0 AND 7),
    turno_inicial turno_codigo,
    movil_inicial_numero smallint CHECK (movil_inicial_numero BETWEEN 1 AND 5),
    fecha_estado date NOT NULL,
    codigo_estado varchar(12) NOT NULL,
    indice_turno smallint,
    indice_movil smallint,
    grupo_vinculado_codigo varchar(80),
    rol_vinculado rol_posicion_vinculada,
    PRIMARY KEY (inicializacion_id, ordinal),
    UNIQUE (inicializacion_id, legajo),
    UNIQUE (inicializacion_id, posicion_codigo)
);

CREATE TABLE inicializacion_dia_staging (
    inicializacion_id uuid NOT NULL REFERENCES inicializacion_sistema(id) ON DELETE CASCADE,
    ordinal smallint NOT NULL,
    fecha_operativa date NOT NULL,
    codigo_origen varchar(30) NOT NULL,
    codigo_normalizado varchar(12) NOT NULL,
    tipo_dia tipo_dia NOT NULL,
    turno turno_codigo,
    movil_numero smallint CHECK (movil_numero BETWEEN 1 AND 5),
    es_novedad boolean NOT NULL,
    mes_origen varchar(30),
    celda_origen varchar(20) NOT NULL,
    PRIMARY KEY (inicializacion_id, ordinal, fecha_operativa),
    FOREIGN KEY (inicializacion_id, ordinal)
        REFERENCES inicializacion_inspector_staging(inicializacion_id, ordinal)
        ON DELETE CASCADE,
    CONSTRAINT ck_staging_dia_contenido CHECK (
        (tipo_dia = 'TRABAJO' AND turno IS NOT NULL AND movil_numero IS NOT NULL) OR
        (tipo_dia IN ('FRANCO','VACACION','LICENCIA','ENFERMEDAD') AND turno IS NULL AND movil_numero IS NULL)
    )
);

CREATE TABLE inicializacion_bloque_staging (
    inicializacion_id uuid NOT NULL REFERENCES inicializacion_sistema(id) ON DELETE CASCADE,
    ordinal smallint NOT NULL,
    secuencia bigint NOT NULL,
    tipo tipo_bloque NOT NULL,
    fecha_desde date NOT NULL,
    fecha_hasta date NOT NULL,
    turno turno_codigo,
    movil_numero smallint CHECK (movil_numero BETWEEN 1 AND 5),
    es_parcial boolean NOT NULL,
    PRIMARY KEY (inicializacion_id, ordinal, secuencia),
    FOREIGN KEY (inicializacion_id, ordinal)
        REFERENCES inicializacion_inspector_staging(inicializacion_id, ordinal)
        ON DELETE CASCADE,
    CONSTRAINT ck_staging_bloque_fechas CHECK (fecha_hasta >= fecha_desde),
    CONSTRAINT ck_staging_bloque_contenido CHECK (
        (tipo = 'TRABAJO' AND turno IS NOT NULL AND movil_numero IS NOT NULL) OR
        (tipo = 'FRANCO' AND turno IS NULL AND movil_numero IS NULL)
    )
);

CREATE INDEX ix_init_dia_fecha ON inicializacion_dia_staging(inicializacion_id, fecha_operativa);
CREATE INDEX ix_init_bloque_periodo ON inicializacion_bloque_staging(inicializacion_id, fecha_desde, fecha_hasta);

CREATE TABLE estado_inicial_posicion (
    posicion_id uuid PRIMARY KEY REFERENCES posicion_cuadratura(id) ON DELETE CASCADE,
    inicializacion_id uuid NOT NULL REFERENCES inicializacion_sistema(id),
    fecha_referencia date NOT NULL,
    posicion_ciclo smallint NOT NULL CHECK (posicion_ciclo BETWEEN 0 AND 7),
    turno turno_codigo,
    movil_id uuid REFERENCES movil(id),
    indice_turno smallint,
    indice_movil smallint,
    codigo_origen varchar(12) NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------
-- Segunda posición de la dupla vinculada. Las personas se asignan por
-- vigencia; el nombre no queda programado en la regla.
-- ------------------------------------------------------------------
INSERT INTO posicion_cuadratura(
    codigo, nombre, tipo, grupo_franco_id, perfil_rotacion_id,
    fecha_ancla, posicion_inicial_ciclo, turno_inicial, movil_inicial_id,
    desfase_dias_referencia, origen_ancla, vigencia_desde
)
SELECT 'M4-P03-EXT', 'Posición externa vinculada a M4-P03', 'VINCULADA',
       gf.id, p.id, DATE '2026-05-04', 0, 'N', m.id, 3,
       'HISTORICO_EXCEL', DATE '2026-05-01'
FROM grupo_franco gf
JOIN perfil_rotacion p ON p.codigo = 'VINCULADA_EXTERNA'
JOIN movil m ON m.numero = 5
WHERE gf.codigo = 'GF-M4-P03'
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO grupo_rotacion_vinculada(
    codigo, nombre, perfil_movil_externo_id, regla_alternancia,
    vigencia_desde
)
SELECT 'GRV-M4-P03', 'Grupo vinculado de la posición M4-P03', p.id,
       '{"cambio":"por_periodo","cortar_bloque":false,"preservar_ciclo":true}'::jsonb,
       DATE '2026-05-01'
FROM perfil_rotacion p
WHERE p.codigo = 'VINCULADA_EXTERNA'
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO miembro_grupo_rotacion_vinculada(grupo_id, posicion_id, rol, orden_alternancia)
SELECT g.id, p.id, x.rol, x.orden
FROM grupo_rotacion_vinculada g
JOIN (VALUES
    ('M4-P03', 'MOVIL4'::rol_posicion_vinculada, 1),
    ('M4-P03-EXT', 'MOVIL_EXTERNO'::rol_posicion_vinculada, 2)
) x(codigo, rol, orden) ON true
JOIN posicion_cuadratura p ON p.codigo = x.codigo
WHERE g.codigo = 'GRV-M4-P03'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------
-- Confirmación transaccional del staging validado.
-- ------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_confirmar_inicializacion(
    p_inicializacion_id uuid,
    p_usuario_id uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_estado estado_inicializacion;
    v_hash char(64);
    v_desde date;
    v_hasta date;
    v_cronograma_id uuid;
    v_version_id uuid;
BEGIN
    SELECT estado, hash_sha256 INTO v_estado, v_hash
    FROM inicializacion_sistema
    WHERE id = p_inicializacion_id
    FOR UPDATE;

    IF v_estado <> 'VALIDADA' THEN
        RAISE EXCEPTION 'La inicialización debe estar VALIDADA; estado actual: %', v_estado;
    END IF;
    IF EXISTS (SELECT 1 FROM inicializacion_sistema WHERE es_activa AND id <> p_inicializacion_id) THEN
        RAISE EXCEPTION 'Ya existe una inicialización activa';
    END IF;
    IF EXISTS (SELECT 1 FROM error_inicializacion WHERE inicializacion_id = p_inicializacion_id AND severidad = 'ERROR') THEN
        RAISE EXCEPTION 'La inicialización posee errores bloqueantes';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM inicializacion_inspector_staging WHERE inicializacion_id = p_inicializacion_id) THEN
        RAISE EXCEPTION 'No hay inspectores en staging';
    END IF;

    SELECT min(fecha_operativa), max(fecha_operativa)
    INTO v_desde, v_hasta
    FROM inicializacion_dia_staging
    WHERE inicializacion_id = p_inicializacion_id;

    INSERT INTO inspector(legajo, nombre_completo, fecha_alta, inicializacion_id)
    SELECT legajo, nombre_normalizado, v_desde, p_inicializacion_id
    FROM inicializacion_inspector_staging
    WHERE inicializacion_id = p_inicializacion_id
    ON CONFLICT (legajo) DO UPDATE
    SET nombre_completo = EXCLUDED.nombre_completo,
        inicializacion_id = COALESCE(inspector.inicializacion_id, EXCLUDED.inicializacion_id),
        actualizado_en = now();

    INSERT INTO grupo_franco(codigo, nombre, fecha_ancla, posicion_inicial_ciclo, origen_ancla, inicializacion_id)
    SELECT DISTINCT s.grupo_franco_codigo,
           'Grupo importado ' || s.grupo_franco_codigo,
           s.fecha_ancla, s.posicion_inicial_ciclo,
           'HISTORICO_EXCEL', p_inicializacion_id
    FROM inicializacion_inspector_staging s
    WHERE s.inicializacion_id = p_inicializacion_id
      AND NOT EXISTS (SELECT 1 FROM grupo_franco g WHERE g.codigo = s.grupo_franco_codigo);

    INSERT INTO posicion_cuadratura(
        codigo, nombre, tipo, grupo_franco_id, perfil_rotacion_id,
        fecha_ancla, posicion_inicial_ciclo, turno_inicial, movil_inicial_id,
        origen_ancla, inicializacion_id, vigencia_desde
    )
    SELECT s.posicion_codigo, 'Posición importada ' || s.posicion_codigo,
           s.posicion_tipo, gf.id, pr.id,
           s.fecha_ancla, s.posicion_inicial_ciclo, s.turno_inicial, m.id,
           'HISTORICO_EXCEL', p_inicializacion_id, v_desde
    FROM inicializacion_inspector_staging s
    JOIN grupo_franco gf ON gf.codigo = s.grupo_franco_codigo
    JOIN perfil_rotacion pr ON pr.codigo = s.perfil_codigo
    LEFT JOIN movil m ON m.numero = s.movil_inicial_numero
    WHERE s.inicializacion_id = p_inicializacion_id
      AND NOT EXISTS (SELECT 1 FROM posicion_cuadratura p WHERE p.codigo = s.posicion_codigo);

    INSERT INTO asignacion_inspector_posicion(
        posicion_id, inspector_id, fecha_desde, motivo, aprobado_por, inicializacion_id
    )
    SELECT p.id, i.id, v_desde, 'Asignación inicial reconstruida desde Excel',
           p_usuario_id, p_inicializacion_id
    FROM inicializacion_inspector_staging s
    JOIN posicion_cuadratura p ON p.codigo = s.posicion_codigo
    JOIN inspector i ON i.legajo = s.legajo
    WHERE s.inicializacion_id = p_inicializacion_id
    ON CONFLICT DO NOTHING;

    INSERT INTO estado_inicial_posicion(
        posicion_id, inicializacion_id, fecha_referencia, posicion_ciclo,
        turno, movil_id, indice_turno, indice_movil, codigo_origen
    )
    SELECT p.id, p_inicializacion_id, s.fecha_estado,
           ((s.fecha_estado - s.fecha_ancla + s.posicion_inicial_ciclo) % 8)::smallint,
           s.turno_inicial, m.id, s.indice_turno, s.indice_movil, s.codigo_estado
    FROM inicializacion_inspector_staging s
    JOIN posicion_cuadratura p ON p.codigo = s.posicion_codigo
    LEFT JOIN movil m ON m.numero = s.movil_inicial_numero
    WHERE s.inicializacion_id = p_inicializacion_id
    ON CONFLICT (posicion_id) DO UPDATE
    SET inicializacion_id = EXCLUDED.inicializacion_id,
        fecha_referencia = EXCLUDED.fecha_referencia,
        posicion_ciclo = EXCLUDED.posicion_ciclo,
        turno = EXCLUDED.turno,
        movil_id = EXCLUDED.movil_id,
        indice_turno = EXCLUDED.indice_turno,
        indice_movil = EXCLUDED.indice_movil,
        codigo_origen = EXCLUDED.codigo_origen;

    INSERT INTO cronograma(codigo, nombre, capa, periodo_desde, periodo_hasta, creado_por, inicializacion_id)
    VALUES ('BASE-INICIAL-' || left(v_hash, 12), 'Cuadratura base inicial importada',
            'BASE', v_desde, v_hasta, p_usuario_id, p_inicializacion_id)
    RETURNING id INTO v_cronograma_id;

    INSERT INTO cronograma_version(cronograma_id, numero_version, estado, creada_por, motivo_cambio)
    VALUES (v_cronograma_id, 1, 'BORRADOR', p_usuario_id, 'Inicialización única desde Excel')
    RETURNING id INTO v_version_id;

    INSERT INTO bloque_cuadratura(
        version_id, posicion_id, inspector_titular_id, secuencia, tipo,
        fecha_desde, fecha_hasta, turno, movil_id, origen, es_parcial
    )
    SELECT v_version_id, p.id, CASE WHEN b.tipo = 'TRABAJO' THEN i.id END,
           b.secuencia, b.tipo, b.fecha_desde, b.fecha_hasta,
           b.turno, m.id, 'IMPORTADO', b.es_parcial
    FROM inicializacion_bloque_staging b
    JOIN inicializacion_inspector_staging s
      ON s.inicializacion_id = b.inicializacion_id AND s.ordinal = b.ordinal
    JOIN posicion_cuadratura p ON p.codigo = s.posicion_codigo
    JOIN inspector i ON i.legajo = s.legajo
    LEFT JOIN movil m ON m.numero = b.movil_numero
    WHERE b.inicializacion_id = p_inicializacion_id;

    CALL sp_materializar_base(v_version_id, p_usuario_id);

    UPDATE cronograma_version SET estado = 'EN_REVISION', enviada_revision_por = p_usuario_id,
           enviada_revision_en = now()
    WHERE id = v_version_id;
    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id, observacion)
    VALUES (v_version_id, 'BORRADOR', 'EN_REVISION', p_usuario_id, 'Confirmación de inicialización');

    UPDATE cronograma_version
    SET estado = 'APROBADA_PUBLICADA', aprobada_publicada_por = p_usuario_id,
        aprobada_publicada_en = now()
    WHERE id = v_version_id;
    INSERT INTO version_estado_historial(version_id, estado_desde, estado_hasta, usuario_id, observacion)
    VALUES (v_version_id, 'EN_REVISION', 'APROBADA_PUBLICADA', p_usuario_id, 'Base inicial confirmada');
    UPDATE cronograma SET version_actual_id = v_version_id WHERE id = v_cronograma_id;

    INSERT INTO registro_golden_master(
        inicializacion_id, inspector_id, posicion_id, fecha_operativa,
        codigo_esperado, turno_esperado, movil_esperado_id, tipo_dia_esperado
    )
    SELECT p_inicializacion_id, i.id, p.id, d.fecha_operativa,
           d.codigo_normalizado, d.turno, m.id, d.tipo_dia
    FROM inicializacion_dia_staging d
    JOIN inicializacion_inspector_staging s
      ON s.inicializacion_id = d.inicializacion_id AND s.ordinal = d.ordinal
    JOIN inspector i ON i.legajo = s.legajo
    JOIN posicion_cuadratura p ON p.codigo = s.posicion_codigo
    LEFT JOIN movil m ON m.numero = d.movil_numero
    WHERE d.inicializacion_id = p_inicializacion_id;

    UPDATE inicializacion_sistema
    SET estado = 'CONFIRMADA', fecha_confirmacion = now(),
        usuario_confirmacion_id = p_usuario_id, es_activa = true
    WHERE id = p_inicializacion_id;
END;
$$;

-- Permite modificar/eliminar exclusivamente la BASE durante una reversión extraordinaria.
CREATE OR REPLACE FUNCTION fn_exigir_version_editable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_version uuid;
BEGIN
    v_version := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
    IF current_setting('app.initialization_reversal', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    IF NOT COALESCE(fn_version_editable(v_version), false) THEN
        RAISE EXCEPTION 'La versión % no es editable', v_version;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION fn_no_eliminar_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_setting('app.initialization_reversal', true) = 'on'
       AND fn_capa_version(OLD.id) = 'BASE'
       AND EXISTS (
           SELECT 1 FROM cronograma c
           WHERE c.id = OLD.cronograma_id AND c.inicializacion_id IS NOT NULL
       ) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Las versiones no se eliminan; se reemplazan o cierran';
END;
$$;

CREATE OR REPLACE PROCEDURE sp_revertir_inicializacion(
    p_inicializacion_id uuid,
    p_usuario_id uuid,
    p_motivo text
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cronograma_id uuid;
    v_version_id uuid;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'El motivo de reversión es obligatorio';
    END IF;

    PERFORM 1 FROM inicializacion_sistema
    WHERE id = p_inicializacion_id AND estado = 'CONFIRMADA' AND es_activa
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La inicialización no está confirmada y activa';
    END IF;

    SELECT c.id, c.version_actual_id INTO v_cronograma_id, v_version_id
    FROM cronograma c WHERE c.inicializacion_id = p_inicializacion_id AND c.capa = 'BASE';

    IF EXISTS (
        SELECT 1 FROM cronograma_version v
        JOIN cronograma c ON c.id = v.cronograma_id
        WHERE c.capa IN ('PLANIFICADA','REAL')
          AND v.derivada_de_version_id = v_version_id
    ) OR EXISTS (SELECT 1 FROM evento_real) THEN
        RAISE EXCEPTION 'No se puede revertir: la operación ya comenzó o existen capas derivadas';
    END IF;

    PERFORM set_config('app.initialization_reversal', 'on', true);

    DELETE FROM registro_golden_master WHERE inicializacion_id = p_inicializacion_id;
    DELETE FROM estado_inicial_posicion WHERE inicializacion_id = p_inicializacion_id;
    DELETE FROM asignacion_inspector_posicion WHERE inicializacion_id = p_inicializacion_id;

    IF v_version_id IS NOT NULL THEN
        DELETE FROM cobertura_dia WHERE version_id = v_version_id;
        DELETE FROM dia_cronograma WHERE version_id = v_version_id;
        DELETE FROM bloque_cuadratura WHERE version_id = v_version_id;
        DELETE FROM materializacion_ejecucion WHERE version_id = v_version_id;
        DELETE FROM version_estado_historial WHERE version_id = v_version_id;
        UPDATE cronograma SET version_actual_id = NULL WHERE id = v_cronograma_id;
        DELETE FROM cronograma_version WHERE id = v_version_id;
        DELETE FROM cronograma WHERE id = v_cronograma_id;
    END IF;

    DELETE FROM posicion_cuadratura WHERE inicializacion_id = p_inicializacion_id;
    DELETE FROM grupo_franco WHERE inicializacion_id = p_inicializacion_id;
    DELETE FROM inspector WHERE inicializacion_id = p_inicializacion_id;

    UPDATE inicializacion_sistema
    SET estado = 'REVERTIDA', es_activa = false, fecha_reversion = now(),
        usuario_reversion_id = p_usuario_id, motivo_reversion = p_motivo
    WHERE id = p_inicializacion_id;

    PERFORM set_config('app.initialization_reversal', 'off', true);
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.initialization_reversal', 'off', true);
    RAISE;
END;
$$;

-- ------------------------------------------------------------------
-- Vigencias y sustituciones de posiciones, incluido móvil 4.
-- ------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_asignar_ocupante_posicion(
    p_posicion_codigo varchar,
    p_inspector_id uuid,
    p_fecha_desde date,
    p_fecha_hasta date,
    p_motivo text,
    p_usuario_id uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_posicion_id uuid;
    v_actual asignacion_inspector_posicion%ROWTYPE;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'El motivo es obligatorio';
    END IF;
    IF p_fecha_hasta IS NOT NULL AND p_fecha_hasta < p_fecha_desde THEN
        RAISE EXCEPTION 'La fecha hasta no puede ser anterior a la fecha desde';
    END IF;
    IF NOT (fn_usuario_tiene_rol(p_usuario_id, 'ADMINISTRACION_SEGURIDAD_VIAL')
            OR fn_usuario_tiene_rol(p_usuario_id, 'JEFE_SECTOR')) THEN
        RAISE EXCEPTION 'El usuario no puede administrar ocupantes';
    END IF;

    SELECT id INTO v_posicion_id FROM posicion_cuadratura
    WHERE codigo = p_posicion_codigo AND estado = 'ACTIVO';
    IF v_posicion_id IS NULL THEN RAISE EXCEPTION 'Posición inexistente o inactiva'; END IF;

    SELECT * INTO v_actual
    FROM asignacion_inspector_posicion
    WHERE posicion_id = v_posicion_id
      AND p_fecha_desde <@ vigencia
    FOR UPDATE;

    IF FOUND THEN
        IF v_actual.fecha_desde >= p_fecha_desde THEN
            RAISE EXCEPTION 'La nueva vigencia debe comenzar después de la vigente';
        END IF;
        UPDATE asignacion_inspector_posicion
        SET fecha_hasta = p_fecha_desde - 1
        WHERE id = v_actual.id;
    END IF;

    INSERT INTO asignacion_inspector_posicion(
        posicion_id, inspector_id, fecha_desde, fecha_hasta,
        motivo, aprobado_por
    ) VALUES (
        v_posicion_id, p_inspector_id, p_fecha_desde, p_fecha_hasta,
        p_motivo, p_usuario_id
    );
END;
$$;

CREATE OR REPLACE PROCEDURE sp_intercambiar_ocupantes_grupo_vinculado(
    p_grupo_codigo varchar,
    p_fecha_desde date,
    p_motivo text,
    p_usuario_id uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_pos1 uuid; v_pos2 uuid;
    v_asig1 uuid; v_asig2 uuid;
    v_ins1 uuid; v_ins2 uuid;
    v_desde1 date; v_desde2 date;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'El motivo es obligatorio';
    END IF;
    IF NOT (fn_usuario_tiene_rol(p_usuario_id, 'ADMINISTRACION_SEGURIDAD_VIAL')
            OR fn_usuario_tiene_rol(p_usuario_id, 'JEFE_SECTOR')) THEN
        RAISE EXCEPTION 'El usuario no puede intercambiar ocupantes';
    END IF;

    SELECT min(m.posicion_id), max(m.posicion_id)
    INTO v_pos1, v_pos2
    FROM miembro_grupo_rotacion_vinculada m
    JOIN grupo_rotacion_vinculada g ON g.id = m.grupo_id
    WHERE g.codigo = p_grupo_codigo AND g.estado = 'ACTIVO';
    IF v_pos1 IS NULL OR v_pos2 IS NULL OR v_pos1 = v_pos2 THEN
        RAISE EXCEPTION 'El grupo vinculado debe tener dos posiciones';
    END IF;

    SELECT id, inspector_id, fecha_desde INTO v_asig1, v_ins1, v_desde1
    FROM asignacion_inspector_posicion
    WHERE posicion_id = v_pos1 AND p_fecha_desde <@ vigencia FOR UPDATE;
    SELECT id, inspector_id, fecha_desde INTO v_asig2, v_ins2, v_desde2
    FROM asignacion_inspector_posicion
    WHERE posicion_id = v_pos2 AND p_fecha_desde <@ vigencia FOR UPDATE;
    IF v_asig1 IS NULL OR v_asig2 IS NULL THEN
        RAISE EXCEPTION 'Ambas posiciones deben tener ocupante vigente';
    END IF;
    IF v_desde1 >= p_fecha_desde OR v_desde2 >= p_fecha_desde THEN
        RAISE EXCEPTION 'El intercambio debe comenzar después del inicio de ambas vigencias';
    END IF;

    -- Primero se cierran ambas vigencias para evitar una superposición temporal
    -- del mismo inspector durante el intercambio.
    UPDATE asignacion_inspector_posicion SET fecha_hasta = p_fecha_desde - 1
    WHERE id IN (v_asig1, v_asig2);

    INSERT INTO asignacion_inspector_posicion(
        posicion_id, inspector_id, fecha_desde, motivo, aprobado_por
    ) VALUES
        (v_pos1, v_ins2, p_fecha_desde, p_motivo, p_usuario_id),
        (v_pos2, v_ins1, p_fecha_desde, p_motivo, p_usuario_id);
END;
$$;

CREATE OR REPLACE VIEW v_movil4_posiciones_vigentes AS
SELECT p.codigo AS posicion_codigo, p.nombre AS posicion_nombre,
       p.tipo, a.fecha_desde, a.fecha_hasta,
       i.id AS inspector_id, i.legajo, i.nombre_completo,
       g.codigo AS grupo_vinculado, mg.rol
FROM posicion_cuadratura p
LEFT JOIN LATERAL (
    SELECT a1.* FROM asignacion_inspector_posicion a1
    WHERE a1.posicion_id = p.id AND current_date <@ a1.vigencia
    ORDER BY a1.fecha_desde DESC LIMIT 1
) a ON true
LEFT JOIN inspector i ON i.id = a.inspector_id
LEFT JOIN miembro_grupo_rotacion_vinculada mg ON mg.posicion_id = p.id
LEFT JOIN grupo_rotacion_vinculada g ON g.id = mg.grupo_id
WHERE p.codigo LIKE 'M4-P%' AND p.estado = 'ACTIVO';

-- ------------------------------------------------------------------
-- Tablero de huecos y filtros operativos.
-- ------------------------------------------------------------------
CREATE OR REPLACE VIEW v_tablero_huecos AS
SELECT c.id AS cronograma_id, c.codigo AS cronograma_codigo, c.capa,
       v.id AS version_id, v.numero_version, v.estado AS estado_version,
       cd.id AS cobertura_id, cd.fecha_operativa,
       m.numero AS movil, cd.turno, cd.cantidad_asignada,
       cd.alerta_activa,
       CASE WHEN cd.responsable_aceptacion_id IS NULL THEN 'PENDIENTE' ELSE 'JUSTIFICADO' END AS estado_aceptacion,
       cd.motivo_hueco, cd.responsable_aceptacion_id,
       u.nombre_mostrar AS responsable_aceptacion,
       cd.fecha_aceptacion,
       greatest(current_date - cd.fecha_operativa, 0) AS dias_desde_fecha
FROM cobertura_dia cd
JOIN cronograma_version v ON v.id = cd.version_id
JOIN cronograma c ON c.id = v.cronograma_id
JOIN movil m ON m.id = cd.movil_id
LEFT JOIN usuario u ON u.id = cd.responsable_aceptacion_id
WHERE cd.estado = 'HUECO';

CREATE OR REPLACE FUNCTION fn_tablero_huecos(
    p_desde date DEFAULT NULL,
    p_hasta date DEFAULT NULL,
    p_movil smallint DEFAULT NULL,
    p_turno turno_codigo DEFAULT NULL,
    p_estado_aceptacion varchar DEFAULT NULL,
    p_version_id uuid DEFAULT NULL
)
RETURNS SETOF v_tablero_huecos
LANGUAGE sql
STABLE
AS $$
    SELECT * FROM v_tablero_huecos h
    WHERE (p_desde IS NULL OR h.fecha_operativa >= p_desde)
      AND (p_hasta IS NULL OR h.fecha_operativa <= p_hasta)
      AND (p_movil IS NULL OR h.movil = p_movil)
      AND (p_turno IS NULL OR h.turno = p_turno)
      AND (p_estado_aceptacion IS NULL OR h.estado_aceptacion = upper(p_estado_aceptacion))
      AND (p_version_id IS NULL OR h.version_id = p_version_id)
    ORDER BY h.fecha_operativa, h.movil, h.turno;
$$;

-- ------------------------------------------------------------------
-- Búsqueda y asignación de trabajos a demanda de vacaciones.
-- Solo propone servicios con hueco, priorizando T, luego N y luego M.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_proponer_trabajos_demanda_vacacion(
    p_novedad_id uuid,
    p_version_id uuid
)
RETURNS TABLE(
    fecha_operativa date,
    movil_id uuid,
    movil smallint,
    turno turno_codigo,
    cantidad_asignada smallint,
    prioridad_turno smallint
)
LANGUAGE sql
STABLE
AS $$
    WITH datos AS (
        SELECT n.fecha_hasta, v.cantidad_trabajos_demanda
        FROM novedad_operativa n
        JOIN vacacion_detalle v ON v.novedad_id = n.id
        WHERE n.id = p_novedad_id AND n.tipo = 'VACACION'
    ), fechas AS (
        SELECT (d.fecha_hasta + gs)::date AS fecha_operativa
        FROM datos d
        CROSS JOIN generate_series(1, d.cantidad_trabajos_demanda) gs
    ), candidatos AS (
        SELECT f.fecha_operativa, c.movil_id, m.numero AS movil, c.turno,
               c.cantidad_asignada,
               CASE c.turno WHEN 'T' THEN 1 WHEN 'N' THEN 2 ELSE 3 END::smallint AS prioridad_turno,
               row_number() OVER (
                   PARTITION BY f.fecha_operativa
                   ORDER BY CASE c.turno WHEN 'T' THEN 1 WHEN 'N' THEN 2 ELSE 3 END,
                            m.numero
               ) AS rn
        FROM fechas f
        JOIN cobertura_dia c ON c.version_id = p_version_id
          AND c.fecha_operativa = f.fecha_operativa
          AND c.estado = 'HUECO'
        JOIN movil m ON m.id = c.movil_id AND m.estado = 'ACTIVO'
    )
    SELECT fecha_operativa, movil_id, movil, turno, cantidad_asignada, prioridad_turno
    FROM candidatos WHERE rn = 1
    ORDER BY fecha_operativa;
$$;

CREATE OR REPLACE PROCEDURE sp_asignar_trabajos_demanda_vacacion(
    p_novedad_id uuid,
    p_version_id uuid,
    p_usuario_id uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_inspector_id uuid;
    v_cantidad smallint;
    v_fecha_fin date;
    v_existentes integer;
    v_propuestas integer;
    r record;
BEGIN
    IF fn_capa_version(p_version_id) <> 'PLANIFICADA' OR NOT fn_version_editable(p_version_id) THEN
        RAISE EXCEPTION 'La versión PLANIFICADA debe ser editable';
    END IF;
    SELECT n.inspector_id, n.fecha_hasta, d.cantidad_trabajos_demanda
    INTO v_inspector_id, v_fecha_fin, v_cantidad
    FROM novedad_operativa n JOIN vacacion_detalle d ON d.novedad_id = n.id
    WHERE n.id = p_novedad_id AND n.tipo = 'VACACION';
    IF v_inspector_id IS NULL THEN RAISE EXCEPTION 'Vacación inexistente'; END IF;

    SELECT count(*) INTO v_existentes FROM ajuste_planificacion
    WHERE version_id = p_version_id AND novedad_id = p_novedad_id
      AND tipo = 'TRABAJO_DEMANDA';
    IF v_existentes > 0 THEN
        RAISE EXCEPTION 'La vacación ya posee trabajos a demanda asignados';
    END IF;

    SELECT count(*) INTO v_propuestas
    FROM fn_proponer_trabajos_demanda_vacacion(p_novedad_id, p_version_id);
    IF v_propuestas <> v_cantidad THEN
        RAISE EXCEPTION 'No hay necesidad operativa suficiente: requeridos %, disponibles %', v_cantidad, v_propuestas;
    END IF;

    FOR r IN SELECT * FROM fn_proponer_trabajos_demanda_vacacion(p_novedad_id, p_version_id)
    LOOP
        INSERT INTO ajuste_planificacion(
            version_id, tipo, prioridad, fecha_desde, fecha_hasta,
            inspector_titular_id, inspector_asignado_id,
            tipo_dia_resultante, turno_resultante, movil_resultante_id,
            novedad_id, motivo, creado_por
        ) VALUES (
            p_version_id, 'TRABAJO_DEMANDA', 20, r.fecha_operativa, r.fecha_operativa,
            v_inspector_id, v_inspector_id,
            'TRABAJO', r.turno, r.movil_id,
            p_novedad_id, 'Trabajo a demanda por necesidad operativa', p_usuario_id
        );
    END LOOP;

    INSERT INTO ajuste_planificacion(
        version_id, tipo, prioridad, fecha_desde, fecha_hasta,
        inspector_titular_id, tipo_dia_resultante,
        novedad_id, motivo, creado_por
    ) VALUES (
        p_version_id, 'FRANCO_ADICIONAL', 30,
        v_fecha_fin + v_cantidad + 1, v_fecha_fin + v_cantidad + 1,
        v_inspector_id, 'FRANCO', p_novedad_id,
        'Franco posterior obligatorio de vacaciones', p_usuario_id
    );
END;
$$;

-- Auditoría de nuevas entidades operativas.
CREATE TRIGGER trg_audit_estado_inicial
AFTER INSERT OR UPDATE OR DELETE ON estado_inicial_posicion
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();

COMMIT;
