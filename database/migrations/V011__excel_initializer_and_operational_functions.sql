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
