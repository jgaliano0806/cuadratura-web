import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class OperationsService {
  constructor(private readonly db: DatabaseService) {}

  async mobile4Positions() {
    const result = await this.db.query(
      `SELECT posicion_codigo,
              posicion_nombre,
              tipo,
              fecha_desde::text AS fecha_desde,
              fecha_hasta::text AS fecha_hasta,
              nombre_completo,
              grupo_vinculado,
              rol
       FROM seguridad_vial.v_movil4_posiciones_vigentes
       ORDER BY nombre_completo NULLS LAST, posicion_codigo`,
    );
    return result.rows;
  }

  async ruta36Positions() {
    const result = await this.db.query(
      `SELECT posicion_codigo,
              posicion_nombre,
              tipo,
              fecha_desde::text AS fecha_desde,
              fecha_hasta::text AS fecha_hasta,
              legajo,
              nombre_completo,
              movil,
              sitio,
              base_nombre
       FROM seguridad_vial.v_ruta36_posiciones_vigentes
       ORDER BY movil, posicion_codigo`,
    );
    return result.rows;
  }

  async listInspectors() {
    const result = await this.db.query(
      `SELECT id, nombre_completo, estado
       FROM seguridad_vial.inspector
       WHERE estado = 'ACTIVO'
       ORDER BY nombre_completo`,
    );
    return result.rows;
  }
}
