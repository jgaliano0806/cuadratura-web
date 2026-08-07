import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

const DEMAND_BY_DAYS: Record<number, number> = {
  7: 0,
  14: 1,
  21: 2,
  28: 1,
  35: 2,
};

@Injectable()
export class VacationsService {
  constructor(private readonly db: DatabaseService) {}

  async list() {
    const result = await this.db.query(
      `SELECT n.id, n.inspector_id, i.nombre_completo AS inspector,
              n.fecha_desde, n.fecha_hasta, n.motivo, n.estado, n.capa_aplicacion,
              v.cantidad_dias, v.cantidad_trabajos_demanda, n.version_registro_id
       FROM seguridad_vial.novedad_operativa n
       JOIN seguridad_vial.inspector i ON i.id = n.inspector_id
       JOIN seguridad_vial.vacacion_detalle v ON v.novedad_id = n.id
       WHERE n.tipo = 'VACACION'
       ORDER BY n.fecha_desde DESC
       LIMIT 100`,
    );
    return result.rows;
  }

  async create(
    input: {
      inspectorId: string;
      dateFrom: string;
      days: number;
      reason: string;
      layer?: 'PLANIFICADA' | 'REAL';
      versionId?: string;
    },
    userId: string,
  ) {
    const demand = DEMAND_BY_DAYS[input.days];
    if (demand === undefined) {
      throw new BadRequestException('Duración de vacaciones inválida');
    }
    const dateFrom = new Date(input.dateFrom + 'T00:00:00Z');
    const dateTo = new Date(dateFrom);
    dateTo.setUTCDate(dateTo.getUTCDate() + input.days - 1);
    const dateToIso = dateTo.toISOString().slice(0, 10);

    return this.db.withClient(
      async (client) => {
        const novelty = await client.query<{ id: string }>(
          `INSERT INTO novedad_operativa(
             tipo, capa_aplicacion, version_registro_id, inspector_id,
             fecha_desde, fecha_hasta, motivo, estado, creada_por
           ) VALUES (
             'VACACION', $1, $2, $3, $4, $5, $6, 'BORRADOR', $7
           ) RETURNING id`,
          [
            input.layer ?? 'PLANIFICADA',
            input.versionId ?? null,
            input.inspectorId,
            input.dateFrom,
            dateToIso,
            input.reason,
            userId,
          ],
        );
        const noveltyId = novelty.rows[0].id;
        await client.query(
          `INSERT INTO vacacion_detalle(
             novedad_id, cantidad_dias, cantidad_trabajos_demanda
           ) VALUES ($1, $2, $3)`,
          [noveltyId, input.days, demand],
        );
        return {
          id: noveltyId,
          date_from: input.dateFrom,
          date_to: dateToIso,
          days: input.days,
          demand_work: demand,
        };
      },
      { userId, changeReason: input.reason },
    );
  }

  async proposals(noveltyId: string, versionId: string) {
    if (!versionId) {
      throw new BadRequestException('version_id es obligatorio');
    }
    const result = await this.db.query(
      `SELECT * FROM seguridad_vial.fn_proponer_trabajos_demanda_vacacion($1::uuid,$2::uuid)`,
      [noveltyId, versionId],
    );
    return result.rows;
  }

  async assign(noveltyId: string, versionId: string, userId: string) {
    await this.db.withClient(
      async (client) => {
        await client.query(
          `CALL sp_asignar_trabajos_demanda_vacacion($1::uuid,$2::uuid,$3::uuid)`,
          [noveltyId, versionId, userId],
        );
      },
      { userId, changeReason: 'Asignación trabajos a demanda' },
    );
    return { status: 'ASIGNADO' };
  }
}
