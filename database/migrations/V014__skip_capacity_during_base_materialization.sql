BEGIN;
SET search_path TO seguridad_vial, public;

-- Durante la materialización de la BASE histórica (Golden Master) el Excel
-- puede contener solapamientos de 3 personas en días puntuales. La regla de
-- capacidad máxima 2 se aplica en PLANIFICADA/REAL, no al importar el histórico.

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

        -- Capacidad máxima 2: no se exige al materializar BASE histórica.
        IF current_setting('app.materializing', true) IS DISTINCT FROM 'on' THEN
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
    END IF;
    RETURN NEW;
END;
$$;

COMMIT;
