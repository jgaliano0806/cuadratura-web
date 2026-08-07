import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async list(limit = 50) {
    const result = await this.db.query(
      `SELECT id, ocurrido_en, usuario_id, entidad, entidad_id, accion, motivo, cliente_ip
       FROM seguridad_vial.evento_auditoria
       ORDER BY ocurrido_en DESC
       LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)],
    );
    return result.rows;
  }
}
