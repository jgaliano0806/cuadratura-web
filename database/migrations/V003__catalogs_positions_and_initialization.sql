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
