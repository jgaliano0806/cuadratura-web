import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { InitializationPreview } from './excel/models';

@Injectable()
export class InitializationRepository {
  constructor(private readonly db: DatabaseService) {}

  async stage(preview: InitializationPreview, userId: string): Promise<string> {
    return this.db.withClient(async (client) => {
      await this.replaceNonConfirmedByHash(client, preview.sha256);

      const insert = await client.query<{ id: string }>(
        `INSERT INTO inicializacion_sistema(
           archivo_original, hoja_origen, hash_sha256, estado,
           usuario_carga_id, resumen_validacion
         ) VALUES ($1,$2,$3,'CARGADA',$4,$5::jsonb) RETURNING id`,
        [
          preview.fileName,
          preview.sheetName,
          preview.sha256,
          userId,
          JSON.stringify({
            valid: preview.isValid,
            issues: preview.issues.length,
          }),
        ],
      );
      const initializationId = insert.rows[0].id;

      for (const issue of preview.issues) {
        await client.query(
          `INSERT INTO error_inicializacion(
             inicializacion_id,fila,columna,valor,codigo_error,detalle,severidad
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            initializationId,
            issue.row ?? null,
            issue.column ?? null,
            issue.value ?? null,
            issue.code,
            issue.detail,
            issue.severity,
          ],
        );
      }

      for (const inspector of preview.inspectors) {
        await client.query(
          `INSERT INTO inicializacion_inspector_staging(
            inicializacion_id,ordinal,fila_origen,legajo,nombre_origen,
            nombre_normalizado,nombre_clave,posicion_codigo,posicion_tipo,
            grupo_franco_codigo,perfil_codigo,fecha_ancla,posicion_inicial_ciclo,
            turno_inicial,movil_inicial_numero,fecha_estado,codigo_estado,
            indice_turno,indice_movil,grupo_vinculado_codigo,rol_vinculado
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [
            initializationId,
            inspector.ordinal,
            inspector.sourceRow,
            inspector.employeeNo,
            inspector.sourceName,
            inspector.name,
            inspector.nameKey,
            inspector.positionCode,
            inspector.positionType,
            inspector.restGroupCode,
            inspector.profileCode,
            inspector.anchorDate,
            inspector.cycleStartPosition,
            inspector.initialShift,
            inspector.initialMobile,
            inspector.stateDate,
            inspector.stateCode,
            inspector.shiftIndex,
            inspector.mobileIndex,
            inspector.linkedGroupCode,
            inspector.linkedRole,
          ],
        );

        for (const day of inspector.days) {
          await client.query(
            `INSERT INTO inicializacion_dia_staging(
              inicializacion_id,ordinal,fecha_operativa,codigo_origen,codigo_normalizado,
              tipo_dia,turno,movil_numero,es_novedad,mes_origen,celda_origen
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              initializationId,
              inspector.ordinal,
              day.date,
              day.sourceCode,
              day.code,
              day.dayType,
              day.shift,
              day.mobile,
              day.isNovelty,
              day.month,
              day.cell,
            ],
          );
        }

        for (const block of inspector.blocks) {
          await client.query(
            `INSERT INTO inicializacion_bloque_staging(
              inicializacion_id,ordinal,secuencia,tipo,fecha_desde,fecha_hasta,
              turno,movil_numero,es_parcial
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              initializationId,
              inspector.ordinal,
              block.sequence,
              block.blockType,
              block.start,
              block.end,
              block.shift,
              block.mobile,
              block.partial,
            ],
          );
        }
      }

      const state = preview.isValid ? 'VALIDADA' : 'FALLIDA';
      await client.query(
        `UPDATE inicializacion_sistema SET estado=$1 WHERE id=$2`,
        [state, initializationId],
      );
      return initializationId;
    }, { userId, changeReason: 'Staging inicialización Excel' });
  }

  /**
   * Permite reintentar el mismo Excel mientras no esté CONFIRMADA/activa.
   * Si ya está confirmada, la reimportación ordinaria está bloqueada (ADR-006).
   */
  private async replaceNonConfirmedByHash(client: PoolClient, sha256: string) {
    const existing = await client.query<{
      id: string;
      estado: string;
      es_activa: boolean;
    }>(
      `SELECT id, estado, es_activa
       FROM inicializacion_sistema
       WHERE hash_sha256 = $1
       FOR UPDATE`,
      [sha256],
    );
    if (!existing.rowCount) return;

    const row = existing.rows[0];
    if (row.es_activa || row.estado === 'CONFIRMADA') {
      throw new BadRequestException(
        'Este Excel ya fue confirmado como inicialización activa. La reimportación ordinaria está bloqueada; use reversión extraordinaria solo si corresponde.',
      );
    }

    // Cascada limpia staging y errores asociados.
    await client.query(`DELETE FROM inicializacion_sistema WHERE id = $1`, [
      row.id,
    ]);
  }

  async confirm(initializationId: string, userId: string) {
    await this.db.withClient(async (client: PoolClient) => {
      await client.query(`CALL sp_confirmar_inicializacion($1::uuid,$2::uuid)`, [
        initializationId,
        userId,
      ]);
    }, { userId, changeReason: 'Confirmación inicialización' });
  }

  async revert(initializationId: string, userId: string, reason: string) {
    await this.db.withClient(async (client) => {
      await client.query(
        `CALL sp_revertir_inicializacion($1::uuid,$2::uuid,$3)`,
        [initializationId, userId, reason],
      );
    }, { userId, changeReason: reason });
  }

  async status() {
    const result = await this.db.query(
      `SELECT id, estado, archivo_original, hoja_origen, hash_sha256,
              fecha_carga AS creado_en, fecha_confirmacion AS confirmado_en,
              fecha_reversion AS revertido_en, es_activa
       FROM seguridad_vial.inicializacion_sistema
       ORDER BY fecha_carga DESC
       LIMIT 5`,
    );
    return result.rows;
  }
}
