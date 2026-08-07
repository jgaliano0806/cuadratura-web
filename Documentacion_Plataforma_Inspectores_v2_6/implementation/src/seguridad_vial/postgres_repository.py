from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import InitializationPreview


def _connect(dsn: str):
    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError("Instale el extra postgres: pip install .[postgres]") from exc
    return psycopg.connect(dsn)


class PostgresInitializerRepository:
    def __init__(self, dsn: str):
        self.dsn = dsn

    def stage(self, preview: InitializationPreview, user_id: str) -> str:
        with _connect(self.dsn) as conn, conn.cursor() as cur:
            cur.execute("SET search_path TO seguridad_vial, public")
            cur.execute(
                """INSERT INTO inicializacion_sistema(
                       archivo_original, hoja_origen, hash_sha256, estado,
                       usuario_carga_id, resumen_validacion
                   ) VALUES (%s,%s,%s,'CARGADA',%s,%s::jsonb) RETURNING id""",
                (preview.file_name, preview.sheet_name, preview.sha256, user_id,
                 json.dumps({"valid": preview.is_valid, "issues": len(preview.issues)})),
            )
            initialization_id = str(cur.fetchone()[0])
            for issue in preview.issues:
                cur.execute(
                    """INSERT INTO error_inicializacion(
                           inicializacion_id,fila,columna,valor,codigo_error,detalle,severidad
                       ) VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                    (initialization_id, issue.row, issue.column, issue.value,
                     issue.code, issue.detail, issue.severity),
                )
            for inspector in preview.inspectors:
                cur.execute(
                    """INSERT INTO inicializacion_inspector_staging(
                        inicializacion_id,ordinal,fila_origen,legajo,nombre_origen,
                        nombre_normalizado,nombre_clave,posicion_codigo,posicion_tipo,
                        grupo_franco_codigo,perfil_codigo,fecha_ancla,posicion_inicial_ciclo,
                        turno_inicial,movil_inicial_numero,fecha_estado,codigo_estado,
                        indice_turno,indice_movil,grupo_vinculado_codigo,rol_vinculado
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (initialization_id, inspector.ordinal, inspector.source_row, inspector.employee_no,
                     inspector.source_name, inspector.name, inspector.name_key, inspector.position_code,
                     inspector.position_type, inspector.rest_group_code, inspector.profile_code,
                     inspector.anchor_date, inspector.cycle_start_position, inspector.initial_shift,
                     inspector.initial_mobile, inspector.state_date, inspector.state_code,
                     inspector.shift_index, inspector.mobile_index, inspector.linked_group_code,
                     inspector.linked_role),
                )
                for day in inspector.days:
                    cur.execute(
                        """INSERT INTO inicializacion_dia_staging(
                            inicializacion_id,ordinal,fecha_operativa,codigo_origen,codigo_normalizado,
                            tipo_dia,turno,movil_numero,es_novedad,mes_origen,celda_origen
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (initialization_id, inspector.ordinal, day.date, day.source_code, day.code,
                         day.day_type, day.shift, day.mobile, day.is_novelty, day.month, day.cell),
                    )
                for block in inspector.blocks:
                    cur.execute(
                        """INSERT INTO inicializacion_bloque_staging(
                            inicializacion_id,ordinal,secuencia,tipo,fecha_desde,fecha_hasta,
                            turno,movil_numero,es_parcial
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (initialization_id, inspector.ordinal, block.sequence, block.block_type,
                         block.start, block.end, block.shift, block.mobile, block.partial),
                    )
            state = "VALIDADA" if preview.is_valid else "FALLIDA"
            cur.execute("UPDATE inicializacion_sistema SET estado=%s WHERE id=%s", (state, initialization_id))
            return initialization_id

    def confirm(self, initialization_id: str, user_id: str) -> None:
        with _connect(self.dsn) as conn, conn.cursor() as cur:
            cur.execute("CALL seguridad_vial.sp_confirmar_inicializacion(%s,%s)", (initialization_id, user_id))

    def revert(self, initialization_id: str, user_id: str, reason: str) -> None:
        with _connect(self.dsn) as conn, conn.cursor() as cur:
            cur.execute("CALL seguridad_vial.sp_revertir_inicializacion(%s,%s,%s)",
                        (initialization_id, user_id, reason))


class OperationsRepository:
    def __init__(self, dsn: str):
        self.dsn = dsn

    def gaps(self, **filters: Any) -> list[dict[str, Any]]:
        with _connect(self.dsn) as conn, conn.cursor() as cur:
            cur.execute("SET search_path TO seguridad_vial, public")
            cur.execute(
                "SELECT * FROM fn_tablero_huecos(%s,%s,%s,%s,%s,%s)",
                (filters.get("date_from"), filters.get("date_to"), filters.get("mobile"),
                 filters.get("shift"), filters.get("acceptance"), filters.get("version_id")),
            )
            columns = [d.name for d in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]

    def mobile4_positions(self) -> list[dict[str, Any]]:
        with _connect(self.dsn) as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM seguridad_vial.v_movil4_posiciones_vigentes ORDER BY posicion_codigo")
            columns = [d.name for d in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]

    def vacation_demand_proposals(self, novelty_id: str, version_id: str) -> list[dict[str, Any]]:
        with _connect(self.dsn) as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM seguridad_vial.fn_proponer_trabajos_demanda_vacacion(%s,%s)",
                        (novelty_id, version_id))
            columns = [d.name for d in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]
