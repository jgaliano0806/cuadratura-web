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
              seccion,
              estado
       FROM seguridad_vial.inspector
       WHERE estado = 'ACTIVO'
         AND tipo_plantel <> 'PEAJISTA'
       ORDER BY coalesce(apellido, nombre_completo), coalesce(nombres, ''), legajo`,
    );
    return result.rows;
  }

  async listLicencias(soloActivas = false, incluirTurnos = false) {
    const result = await this.db.query(
      `SELECT id, codigo, codigo_sap, nombre, horario, ambito, tipo,
              activo, orden, color_fondo, color_letra
       FROM seguridad_vial.catalogo_licencia
       WHERE ($1::boolean IS NOT TRUE OR activo = true)
         AND (
           tipo IN ('AUSENCIA', 'FRANCO')
           OR ($2::boolean IS TRUE AND tipo = 'TURNO')
         )
         AND ambito = 'SEGURIDAD_VIAL'
       ORDER BY orden, codigo`,
      [soloActivas, incluirTurnos],
    );
    return result.rows;
  }

  async listTimerMotivos() {
    const result = await this.db.query(
      `SELECT id, nombre, orden
       FROM seguridad_vial.catalogo_timer_motivo
       WHERE activo = true
       ORDER BY orden, nombre`,
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

  async listTimerExtras(from: string, to: string) {
    const result = await this.db.query(
      `SELECT e.id,
              e.inspector_id,
              e.fecha::text AS fecha,
              e.motivo,
              e.observacion,
              e.codigo_ideal AS ideal,
              e.codigo_real AS real,
              i.legajo,
              i.apellido,
              i.nombres,
              i.nombre_completo
       FROM seguridad_vial.timer_extra e
       JOIN seguridad_vial.inspector i ON i.id = e.inspector_id
       WHERE e.fecha BETWEEN $1::date AND $2::date
       ORDER BY e.fecha, coalesce(i.apellido, i.nombre_completo), i.legajo`,
      [from, to],
    );
    return result.rows;
  }

  async createTimerExtra(
    userId: string,
    body: {
      inspector_id: string;
      fecha: string;
      motivo: string;
      observacion?: string;
      ideal?: string;
      real?: string;
    },
  ) {
    const result = await this.db.query(
      `INSERT INTO seguridad_vial.timer_extra (
         inspector_id, fecha, motivo, observacion, codigo_ideal, codigo_real, creado_por
       )
       VALUES ($1, $2::date, btrim($3), coalesce(btrim($4), ''), coalesce($5, ''), coalesce($6, ''), $7)
       RETURNING id`,
      [
        body.inspector_id,
        body.fecha,
        body.motivo,
        body.observacion ?? '',
        body.ideal ?? '',
        body.real ?? '',
        userId,
      ],
    );
    const rows = await this.listTimerExtras(body.fecha, body.fecha);
    return rows.find((r) => r.id === result.rows[0].id) ?? result.rows[0];
  }

  async updateTimerExtra(
    id: string,
    body: {
      motivo?: string;
      observacion?: string;
      ideal?: string;
      real?: string;
    },
  ) {
    const result = await this.db.query(
      `UPDATE seguridad_vial.timer_extra
       SET motivo = CASE WHEN $2::text IS NULL THEN motivo ELSE btrim($2) END,
           observacion = CASE WHEN $3::text IS NULL THEN observacion ELSE coalesce(btrim($3), '') END,
           codigo_ideal = CASE WHEN $4::text IS NULL THEN codigo_ideal ELSE coalesce($4, '') END,
           codigo_real = CASE WHEN $5::text IS NULL THEN codigo_real ELSE coalesce($5, '') END,
           actualizado_en = now()
       WHERE id = $1
       RETURNING fecha::text AS fecha`,
      [id, body.motivo ?? null, body.observacion ?? null, body.ideal ?? null, body.real ?? null],
    );
    const fecha = result.rows[0]?.fecha as string | undefined;
    if (!fecha) return null;
    const rows = await this.listTimerExtras(fecha, fecha);
    return rows.find((r) => r.id === id) ?? null;
  }

  async deleteTimerExtra(id: string) {
    const result = await this.db.query(
      `DELETE FROM seguridad_vial.timer_extra WHERE id = $1 RETURNING id`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listTimerGuardados() {
    const result = await this.db.query(
      `SELECT g.id,
              g.fecha_desde::text AS fecha_desde,
              g.fecha_hasta::text AS fecha_hasta,
              g.nota,
              g.guardado_en,
              (SELECT count(*)::int FROM seguridad_vial.timer_guardado_fila f
               WHERE f.guardado_id = g.id) AS filas
       FROM seguridad_vial.timer_guardado g
       ORDER BY g.guardado_en DESC
       LIMIT 80`,
    );
    return result.rows;
  }

  async getTimerGuardado(id: string) {
    const head = await this.db.query(
      `SELECT g.id,
              g.fecha_desde::text AS fecha_desde,
              g.fecha_hasta::text AS fecha_hasta,
              g.nota,
              g.guardado_en
       FROM seguridad_vial.timer_guardado g
       WHERE g.id = $1`,
      [id],
    );
    const doc = head.rows[0];
    if (!doc) return null;
    const filas = await this.db.query(
      `SELECT id,
              fecha::text AS fecha,
              inspector_id,
              origen,
              legajo,
              persona,
              codigo_ideal AS ideal,
              codigo_real AS real,
              motivo,
              observacion
       FROM seguridad_vial.timer_guardado_fila
       WHERE guardado_id = $1
       ORDER BY orden, fecha, persona`,
      [id],
    );
    return { ...doc, filas: filas.rows };
  }

  async createTimerGuardado(
    userId: string,
    body: {
      from: string;
      to: string;
      nota?: string;
      filas: Array<{
        fecha: string;
        inspector_id?: string;
        origen: 'auto' | 'extra';
        legajo?: string;
        persona: string;
        ideal?: string;
        real?: string;
        motivo?: string;
        observacion?: string;
      }>;
    },
  ) {
    return this.db.withClient(async (c) => {
      const head = await c.query(
        `INSERT INTO timer_guardado (fecha_desde, fecha_hasta, nota, guardado_por)
         VALUES ($1::date, $2::date, coalesce(btrim($3), ''), $4)
         RETURNING id,
                   fecha_desde::text AS fecha_desde,
                   fecha_hasta::text AS fecha_hasta,
                   nota,
                   guardado_en`,
        [body.from, body.to, body.nota ?? '', userId],
      );
      const id = head.rows[0].id as string;
      for (let i = 0; i < body.filas.length; i += 1) {
        const f = body.filas[i];
        await c.query(
          `INSERT INTO timer_guardado_fila (
             guardado_id, orden, fecha, inspector_id, origen,
             legajo, persona, codigo_ideal, codigo_real, motivo, observacion
           )
           VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            i,
            f.fecha,
            f.inspector_id || null,
            f.origen,
            f.legajo === '—' ? '' : f.legajo || '',
            f.persona,
            f.ideal ?? '',
            f.real ?? '',
            f.motivo ?? '',
            f.observacion ?? '',
          ],
        );
      }
      return { ...head.rows[0], filas: body.filas.length };
    }, { userId });
  }
}
