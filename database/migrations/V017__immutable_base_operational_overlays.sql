-- V017: las excepciones operativas se superponen sin modificar la cuadratura base.
BEGIN;
SET search_path TO seguridad_vial, public;

CREATE TABLE asignacion_operativa (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inspector_id uuid NOT NULL REFERENCES inspector(id),
    tipo varchar(40) NOT NULL CHECK (tipo IN ('CAMBIO_MOVIL', 'CAMBIO_TURNO', 'LICENCIA', 'COBERTURA', 'SUSTITUCION', 'INTERCAMBIO_M4_MENSUAL')),
    fecha_desde date NOT NULL,
    fecha_hasta date,
    tipo_dia tipo_dia,
    turno turno_codigo,
    movil_id uuid REFERENCES movil(id),
    posicion_destino_id uuid REFERENCES posicion_cuadratura(id),
    motivo text NOT NULL,
    estado varchar(12) NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'CERRADA', 'ANULADA')),
    creada_por uuid NOT NULL REFERENCES usuario(id),
    creada_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_asignacion_operativa_fechas CHECK (fecha_hasta IS NULL OR fecha_hasta >= fecha_desde),
    CONSTRAINT ck_asignacion_operativa_resultado CHECK (tipo_dia IS NOT NULL OR turno IS NOT NULL OR movil_id IS NOT NULL OR posicion_destino_id IS NOT NULL)
);

CREATE INDEX ix_asignacion_operativa_inspector_periodo ON asignacion_operativa(inspector_id, fecha_desde, fecha_hasta);
CREATE TRIGGER trg_audit_asignacion_operativa
AFTER INSERT OR UPDATE OR DELETE ON asignacion_operativa
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();

COMMENT ON TABLE asignacion_operativa IS
'Superposiciones operativas auditables. Nunca modifican estado_inicial_posicion, bloque_cuadratura ni asignacion_inspector_posicion.';

-- La rutina histórica mutaba ocupantes base; se bloquea para impedirlo.
CREATE OR REPLACE PROCEDURE sp_intercambiar_ocupantes_grupo_vinculado(
    p_grupo_codigo varchar, p_fecha_desde date, p_motivo text, p_usuario_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'El intercambio % es operativo: registre asignaciones_operativas con inicio posterior al servicio en curso; la cuadratura base es inmutable', p_grupo_codigo;
END;
$$;

COMMIT;
