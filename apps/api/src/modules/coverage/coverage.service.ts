import { Injectable } from '@nestjs/common';
import type { GapRow } from '@plataforma/shared';
import { DatabaseService } from '../../database/database.service';

export type GapFilters = {
  dateFrom?: string;
  dateTo?: string;
  mobile?: number;
  shift?: string;
  acceptance?: string;
  versionId?: string;
};

@Injectable()
export class CoverageService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Tablero de huecos de cobertura.
   *
   * Delega en `fn_tablero_huecos`, que ya resuelve el filtrado y el orden
   * (V011). Los parámetros nulos no filtran.
   */
  async gaps(filters: GapFilters = {}): Promise<GapRow[]> {
    const result = await this.db.query<GapRow>(
      `SELECT fecha_operativa::text,
              movil,
              turno::text AS turno,
              estado_aceptacion,
              motivo_hueco,
              responsable_aceptacion,
              version_id
       FROM seguridad_vial.fn_tablero_huecos(
              $1::date, $2::date, $3::smallint, $4::seguridad_vial.turno_codigo,
              $5::varchar, $6::uuid)`,
      [
        filters.dateFrom ?? null,
        filters.dateTo ?? null,
        filters.mobile ?? null,
        filters.shift ?? null,
        filters.acceptance ?? null,
        filters.versionId ?? null,
      ],
    );
    return result.rows;
  }
}
