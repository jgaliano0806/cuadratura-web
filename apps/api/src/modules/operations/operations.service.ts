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
      `SELECT id,
              legajo,
              nombres,
              apellido,
              nombre_completo,
              tipo_plantel,
              estado
       FROM seguridad_vial.inspector
       WHERE estado = 'ACTIVO'
         AND tipo_plantel <> 'PEAJISTA'
       ORDER BY coalesce(apellido, nombre_completo), coalesce(nombres, ''), legajo`,
    );
    return result.rows;
  }

  async listLicencias(soloActivas = false) {
    const result = await this.db.query(
      `SELECT id, codigo, nombre, activo, orden, color_fondo, color_letra
       FROM seguridad_vial.catalogo_licencia
       WHERE ($1::boolean IS NOT TRUE OR activo = true)
       ORDER BY orden, nombre`,
      [soloActivas],
    );
    return result.rows;
  }

  async listMobiles() {
    const result = await this.db.query(
      `SELECT id, numero, capacidad_maxima, estado
       FROM seguridad_vial.movil
       WHERE estado = 'ACTIVO'
       ORDER BY numero`,
    );
    return result.rows;
  }
}
