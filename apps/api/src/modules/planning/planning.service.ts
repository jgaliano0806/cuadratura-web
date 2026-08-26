import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class PlanningService {
  constructor(private readonly db: DatabaseService) {}

  async listVersions(capa?: string) {
    const result = await this.db.query(
      `SELECT v.id, c.codigo, c.nombre, c.capa, c.periodo_desde, c.periodo_hasta,
              v.numero_version, v.estado, v.creada_en, v.enviada_revision_en,
              v.aprobada_publicada_en, v.observaciones_revision
       FROM seguridad_vial.cronograma_version v
       JOIN seguridad_vial.cronograma c ON c.id = v.cronograma_id
       WHERE ($1::text IS NULL OR c.capa::text = $1)
       ORDER BY v.creada_en DESC
       LIMIT 100`,
      [capa ?? null],
    );
    return result.rows;
  }

  async calendar(
    versionId: string,
    dateFrom?: string,
    dateTo?: string,
    mobile?: number,
  ) {
    const days = await this.db.query(
      `SELECT d.fecha_operativa::text AS fecha_operativa,
              d.tipo_dia, d.turno, d.codigo, d.origen,
              m.numero AS movil,
              p.codigo AS posicion_codigo,
              i.id AS inspector_id,
              i.legajo,
              i.nombres,
              i.apellido,
              i.nombre_completo AS inspector,
              lic.licencia_codigo,
              lic.color_fondo AS licencia_color_fondo,
              lic.color_letra AS licencia_color_letra,
              it.nombre_completo AS inspector_titular,
              ia.nombre_completo AS inspector_asignado
       FROM seguridad_vial.dia_cronograma d
       LEFT JOIN seguridad_vial.movil m ON m.id = d.movil_id
       JOIN seguridad_vial.posicion_cuadratura p ON p.id = d.posicion_id
       LEFT JOIN seguridad_vial.inspector it ON it.id = d.inspector_titular_id
       LEFT JOIN seguridad_vial.inspector ia ON ia.id = d.inspector_asignado_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(d.inspector_asignado_id, d.inspector_titular_id, a.inspector_id) AS inspector_id
         FROM (SELECT 1) _
         LEFT JOIN seguridad_vial.asignacion_inspector_posicion a
           ON a.posicion_id = d.posicion_id
          AND d.fecha_operativa >= a.fecha_desde
          AND (a.fecha_hasta IS NULL OR d.fecha_operativa <= a.fecha_hasta)
         LIMIT 1
       ) resolved ON true
       LEFT JOIN seguridad_vial.inspector i ON i.id = resolved.inspector_id
       LEFT JOIN LATERAL (
         SELECT cl.codigo AS licencia_codigo,
                cl.color_fondo,
                cl.color_letra
         FROM seguridad_vial.asignacion_operativa ao
         JOIN seguridad_vial.catalogo_licencia cl ON cl.id = ao.catalogo_licencia_id
         WHERE ao.estado = 'ACTIVA'
           AND ao.tipo = 'LICENCIA'
           AND ao.tipo_dia = 'LICENCIA'
           AND ao.inspector_id = resolved.inspector_id
           AND d.fecha_operativa >= ao.fecha_desde
           AND (ao.fecha_hasta IS NULL OR d.fecha_operativa <= ao.fecha_hasta)
         ORDER BY ao.creada_en DESC
         LIMIT 1
       ) lic ON true
       WHERE d.version_id = $1
         AND i.id IS NOT NULL
         AND i.estado = 'ACTIVO'
         AND i.tipo_plantel <> 'PEAJISTA'
         AND ($2::date IS NULL OR d.fecha_operativa >= $2)
         AND ($3::date IS NULL OR d.fecha_operativa <= $3)
         AND ($4::int IS NULL OR m.numero = $4)
       ORDER BY i.legajo NULLS LAST, d.fecha_operativa, m.numero NULLS LAST`,
      [versionId, dateFrom ?? null, dateTo ?? null, mobile ?? null],
    );

    const coverage = await this.db.query(
      `SELECT cd.fecha_operativa::text AS fecha_operativa,
              m.numero AS movil,
              cd.turno,
              cd.cantidad_asignada,
              cd.estado::text AS estado,
              cd.alerta_activa,
              CASE WHEN cd.responsable_aceptacion_id IS NULL AND cd.estado = 'HUECO'
                   THEN 'PENDIENTE' ELSE 'OK' END AS aceptacion
       FROM seguridad_vial.cobertura_dia cd
       JOIN seguridad_vial.movil m ON m.id = cd.movil_id AND m.estado = 'ACTIVO'
       WHERE cd.version_id = $1
         AND ($2::date IS NULL OR cd.fecha_operativa >= $2)
         AND ($3::date IS NULL OR cd.fecha_operativa <= $3)
       ORDER BY cd.fecha_operativa, m.numero, cd.turno`,
      [versionId, dateFrom ?? null, dateTo ?? null],
    );

    const totals = await this.db.query(
      `SELECT d.fecha_operativa::text AS fecha_operativa,
              count(*) FILTER (WHERE d.tipo_dia = 'FRANCO')::int AS francos,
              count(*) FILTER (WHERE d.tipo_dia = 'VACACION')::int AS vacaciones,
              count(*) FILTER (WHERE d.tipo_dia = 'ENFERMEDAD')::int AS enfermedades,
              count(*) FILTER (WHERE d.tipo_dia = 'TRABAJO')::int AS trabajos
       FROM seguridad_vial.dia_cronograma d
       WHERE d.version_id = $1
         AND ($2::date IS NULL OR d.fecha_operativa >= $2)
         AND ($3::date IS NULL OR d.fecha_operativa <= $3)
       GROUP BY d.fecha_operativa
       ORDER BY d.fecha_operativa`,
      [versionId, dateFrom ?? null, dateTo ?? null],
    );

    const gaps = coverage.rows.filter((r) => Number(r.cantidad_asignada) === 0).length;
    const overlaps = coverage.rows.filter((r) => Number(r.cantidad_asignada) >= 2).length;
    const vacationsDays = totals.rows.reduce(
      (acc, r) => acc + Number(r.vacaciones || 0),
      0,
    );

    return {
      days: days.rows,
      coverage: coverage.rows,
      daily_totals: totals.rows,
      summary: {
        huecos: gaps,
        solapamientos: overlaps,
        dias_con_vacaciones: totals.rows.filter((r) => Number(r.vacaciones) > 0)
          .length,
        asignaciones_vacacion: vacationsDays,
      },
    };
  }

  async submit(versionId: string, userId: string) {
    await this.db.withClient(
      async (client) => {
        await client.query(`CALL sp_enviar_revision($1::uuid,$2::uuid)`, [
          versionId,
          userId,
        ]);
      },
      { userId, changeReason: 'Envío a revisión' },
    );
    return { status: 'EN_REVISION' };
  }

  async observe(versionId: string, observation: string, userId: string) {
    await this.db.withClient(
      async (client) => {
        await client.query(
          `CALL sp_observar_version($1::uuid,$2,$3::uuid)`,
          [versionId, observation, userId],
        );
      },
      { userId, changeReason: observation },
    );
    return { status: 'OBSERVADA' };
  }

  async reopen(versionId: string, userId: string) {
    await this.db.withClient(
      async (client) => {
        await client.query(`CALL sp_reabrir_observada($1::uuid,$2::uuid)`, [
          versionId,
          userId,
        ]);
      },
      { userId, changeReason: 'Reapertura de versión observada' },
    );
    return { status: 'BORRADOR' };
  }

  async approveAndPublish(versionId: string, userId: string) {
    await this.db.withClient(
      async (client) => {
        await client.query(
          `CALL sp_aprobar_publicar_version($1::uuid,$2::uuid)`,
          [versionId, userId],
        );
      },
      { userId, changeReason: 'Aprobar y publicar' },
    );
    return { status: 'APROBADA_PUBLICADA' };
  }

  async close(versionId: string, userId: string) {
    await this.db.withClient(
      async (client) => {
        await client.query(`CALL sp_cerrar_version($1::uuid,$2::uuid)`, [
          versionId,
          userId,
        ]);
      },
      { userId, changeReason: 'Cierre de período' },
    );
    return { status: 'CERRADA' };
  }
}
