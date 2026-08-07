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
