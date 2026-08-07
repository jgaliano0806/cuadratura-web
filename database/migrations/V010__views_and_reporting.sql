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
