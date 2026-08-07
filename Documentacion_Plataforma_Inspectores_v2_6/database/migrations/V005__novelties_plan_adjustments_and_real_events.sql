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
