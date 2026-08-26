import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import {
  applyOperationalExceptions,
  projectRange,
  type OperationalException,
  type ProjectedDay,
  type ProjectionInput,
  type ShiftCode,
} from './projection';
import { FRANJA, resolverSuperposiciones } from './desdoble';
import {
  calcularOcupacion,
  resumenPorDia,
  resumenPorMovil,
  slotsConProblema,
} from './ocupacion';

type CronogramaContiguo = {
  id: string;
  codigo: string;
  version_id: string;
  numero_version: number;
  estado: string;
};

async function lookupContiguo(
  client: PoolClient,
  capa: 'PLANIFICADA' | 'REAL',
  dateFrom: string,
  dateTo: string,
): Promise<CronogramaContiguo | null> {
  const found = await client.query<CronogramaContiguo>(
    `SELECT c.id, c.codigo,
            v.id AS version_id,
            v.numero_version,
            v.estado::text AS estado
     FROM seguridad_vial.cronograma c
     JOIN seguridad_vial.cronograma_version v
       ON v.id = COALESCE(
            c.version_actual_id,
            (SELECT v2.id FROM seguridad_vial.cronograma_version v2
             WHERE v2.cronograma_id = c.id
             ORDER BY v2.numero_version DESC
             LIMIT 1)
          )
     WHERE c.capa = $3::seguridad_vial.tipo_capa
       AND c.periodo_hasta >= ($1::date - 1)
       AND c.periodo_desde <= ($2::date + 1)
     ORDER BY c.periodo_hasta DESC, v.creada_en DESC
     LIMIT 1`,
    [dateFrom, dateTo, capa],
  );
  return found.rows[0] ?? null;
}

@Injectable()
export class ScheduleEngineService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Ocupación de cada móvil, turno y día del rango.
   *
   * Por defecto informa la cuadratura ya desdoblada, que es la que se va a
   * operar. Con `sinDesdoblar` se ve el reparto crudo, útil para comparar
   * cuánto cambió el desdoble.
   */
  async ocupacion(
    dateFrom: string,
    dateTo: string,
    opciones: { sinDesdoblar?: boolean; permitirMovil4?: boolean } = {},
  ) {
    this.assertRange(dateFrom, dateTo);
    const inputs = await this.loadProjectionInputs();
    const days: ProjectedDay[] = [];
    for (const input of inputs) {
      days.push(...projectRange(input, dateFrom, dateTo));
    }

    const desdoblar = !opciones.sinDesdoblar;
    const { days: efectivos, desdobles } = desdoblar
      ? resolverSuperposiciones(days, {
          permitirMovil4: opciones.permitirMovil4 ?? false,
        })
      : { days, desdobles: [] };

    const slots = calcularOcupacion(efectivos);
    const problemas = slotsConProblema(slots);

    return {
      date_from: dateFrom,
      date_to: dateTo,
      desdoblada: desdoblar,
      slots,
      por_dia: resumenPorDia(efectivos),
      por_movil: resumenPorMovil(slots),
      problemas,
      totales: {
        slots: slots.length,
        huecos: problemas.filter((s) => s.estado === 'HUECO').length,
        cubiertas: slots.filter((s) => s.estado === 'CUBIERTA').length,
        dobles: slots.filter((s) => s.estado === 'DOBLE').length,
        superpuestas: problemas.filter((s) => s.estado === 'SUPERPUESTA').length,
        desdobles_aplicados: desdobles.filter((d) => d.estado === 'RESUELTO')
          .length,
      },
      referencia:
        'HUECO = nadie cubre el móvil · CUBIERTA = un inspector (lo buscado) · ' +
        'DOBLE = dos, reparto normal · SUPERPUESTA = tres o más, requiere desdoble.',
    };
  }

  /**
   * Detecta superposiciones de 3 inspectores en un mismo móvil/turno/día y las
   * resuelve moviendo a uno al móvil que comparte su horario de entrada.
   *
   * Es una simulación: devuelve qué movimientos harían falta y por qué, sin
   * escribir nada. Los movimientos se registran después como asignaciones
   * operativas, así la cuadratura base queda intacta.
   */
  async previewDesdobles(
    dateFrom: string,
    dateTo: string,
    permitirMovil4 = false,
  ) {
    this.assertRange(dateFrom, dateTo);
    const inputs = await this.loadProjectionInputs();
    const days: ProjectedDay[] = [];
    for (const input of inputs) {
      days.push(...projectRange(input, dateFrom, dateTo));
    }

    const { desdobles } = resolverSuperposiciones(days, { permitirMovil4 });
    const sinResolver = desdobles.filter((d) => d.estado === 'SIN_DESTINO');

    return {
      date_from: dateFrom,
      date_to: dateTo,
      total: desdobles.length,
      resueltos: desdobles.length - sinResolver.length,
      sin_destino: sinResolver.length,
      permitir_movil4: permitirMovil4,
      desdobles,
      regla:
        'Con 3 inspectores en un mismo móvil se mueve a uno al móvil que comparte ' +
        'el horario de entrada (1↔2, 3↔5), conservando el turno. Dos en un móvil ' +
        'es reparto normal y no se toca.',
      criterio:
        'Se mueve al que menos veces fue desdoblado; si empatan, al que hace más ' +
        'tiempo que no le toca; si siguen empatados, por puntero rotativo. No ' +
        'interviene la antigüedad ni el legajo.',
    };
  }

  async preview(dateFrom: string, dateTo: string) {
    this.assertRange(dateFrom, dateTo);
    const inputs = await this.loadProjectionInputs();
    const days: ProjectedDay[] = [];
    for (const input of inputs) {
      days.push(...projectRange(input, dateFrom, dateTo));
    }
    // PLANIFICADA: solo ciclo 5×3. Overlays (incl. Haro–Ramos) van a REAL.
    days.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.positionCode.localeCompare(b.positionCode),
    );
    return {
      date_from: dateFrom,
      date_to: dateTo,
      positions: inputs.length,
      days_generated: days.length,
      sample: days.slice(0, 50),
      by_code: summarizeCodes(days),
      layer: 'PLANIFICADA' as const,
      note: 'Proyección base sin asignaciones operativas. La dupla Haro–Ramos se aplica en capa REAL.',
    };
  }

  /**
   * Crea una versión PLANIFICADA (borrador) con proyección del motor,
   * derivada de la BASE publicada.
   */
  async apply(dateFrom: string, dateTo: string, userId: string) {
    this.assertRange(dateFrom, dateTo);
    const inputs = await this.loadProjectionInputs();
    if (!inputs.length) {
      throw new BadRequestException(
        'No hay inspectores activos con secuencia. Cargalos en Administración → Inspectores y volvé a generar el ciclo.',
      );
    }

    // 2.7: la capa BASE ya no contiene datos históricos. Se usa la BASE seed
    // (`BASE-SEED-2_7`) sólo como ancla para que las PLANIFICADAS satisfagan
    // el trigger de integridad `PLANIFICADA debe derivar de BASE`.
    const base = await this.db.query<{ version_id: string }>(
      `SELECT v.id AS version_id
       FROM seguridad_vial.cronograma_version v
       JOIN seguridad_vial.cronograma c ON c.id = v.cronograma_id
       WHERE c.capa = 'BASE' AND v.estado = 'APROBADA_PUBLICADA'
       ORDER BY v.aprobada_publicada_en DESC NULLS LAST
       LIMIT 1`,
    );
    if (!base.rows[0]) {
      throw new NotFoundException(
        'No hay BASE seed publicada. Aplicá la migración V023__base_seed_2_7.sql.',
      );
    }
    const baseVersionId = base.rows[0].version_id;

    const allDays: ProjectedDay[] = [];
    for (const input of inputs) {
      allDays.push(...projectRange(input, dateFrom, dateTo));
    }
    // Sin applyOperationalExceptions: PLAN queda limpia.

    // Desdoble obligatorio antes de materializar: `cobertura_dia` acepta como
    // máximo 2 inspectores por móvil/turno/día (ck_cobertura_estado), así que un
    // triple hace fallar el INSERT. Se mueve a uno al móvil que comparte el
    // horario de entrada, conservando el turno y sin tocar la cuadratura base.
    const { days: resolvedDays, desdobles } = resolverSuperposiciones(allDays, {
      cualquierMovilDelTurno: true,
    });
    allDays.length = 0;
    allDays.push(...resolvedDays);

    const sinDestino = desdobles.filter((d) => d.estado === 'SIN_DESTINO');
    if (sinDestino.length) {
      const TURNO_TEXTO: Record<string, string> = {
        M: 'mañana',
        T: 'tarde',
        N: 'noche',
      };
      const HORA_ENTRADA: Record<string, Record<string, string>> = {
        M: { TEMPRANA: '05:00', TARDIA: '07:00' },
        T: { TEMPRANA: '13:00', TARDIA: '15:00' },
        N: { TEMPRANA: '21:00', TARDIA: '23:00' },
      };

      // Se devuelve la lista completa para que la pantalla la muestre y el
      // usuario resuelva caso por caso. No se mueve a nadie fuera de su franja
      // horaria: eso le cambiaría la hora de entrada.
      const casos = sinDestino.map((d) => {
        const franja = FRANJA[d.movilOrigen];
        return {
          fecha: d.date,
          turno: d.turno,
          turno_texto: TURNO_TEXTO[d.turno] ?? d.turno,
          movil: d.movilOrigen,
          hora_entrada: HORA_ENTRADA[d.turno]?.[franja] ?? null,
          inspectores: d.inspectores,
          motivo: d.motivo,
        };
      });

      throw new BadRequestException({
        statusCode: 400,
        error: 'DESDOBLE_SIN_DESTINO',
        message:
          `Hay ${sinDestino.length} caso(s) donde tres inspectores coinciden en el ` +
          `mismo móvil y turno, y los otros móviles con el mismo horario de ` +
          `entrada ya están completos. No se movió a nadie: hacerlo le cambiaría ` +
          `la hora de entrada. Resolvelos a mano y volvé a generar.`,
        casos_a_resolver: casos,
      });
    }

    const mobiles = await this.db.query<{ id: string; numero: number }>(
      `SELECT id, numero FROM seguridad_vial.movil WHERE estado = 'ACTIVO'`,
    );
    const mobileByNumber = new Map(
      mobiles.rows.map((m) => [Number(m.numero), m.id]),
    );

    return this.db.withClient(
      async (client) => {
        await client.query(`SELECT set_config('app.materializing', 'on', true)`);

        let codigo = `PLAN-${dateFrom.replace(/-/g, '')}-${dateTo.replace(/-/g, '')}`;
        let cronogramaId: string;
        let versionId: string;
        let numero: number;
        let reused = false;
        let wipe = false;

        const existing = await client.query<{ id: string }>(
          `SELECT id FROM seguridad_vial.cronograma WHERE codigo = $1`,
          [codigo],
        );
        const contiguo = existing.rows[0]
          ? null
          : await lookupContiguo(client, 'PLANIFICADA', dateFrom, dateTo);

        if (existing.rows[0] || contiguo) {
          if (contiguo?.estado === 'EN_REVISION') {
            throw new BadRequestException(
              'Ya hay una versión PLANIFICADA en revisión. Devolvéla a borrador antes de regenerar.',
            );
          }
          cronogramaId = existing.rows[0]?.id ?? contiguo!.id;
          if (contiguo) codigo = contiguo.codigo;
          wipe = Boolean(existing.rows[0]);
          await client.query(
            `UPDATE seguridad_vial.cronograma
             SET periodo_desde = least(periodo_desde, $2::date),
                 periodo_hasta = greatest(periodo_hasta, $3::date)
             WHERE id = $1`,
            [cronogramaId, dateFrom, dateTo],
          );

          const draft = await client.query<{
            id: string;
            numero_version: number;
            estado: string;
          }>(
            `SELECT id, numero_version, estado::text AS estado
             FROM seguridad_vial.cronograma_version
             WHERE cronograma_id = $1
               AND estado IN (
                 'BORRADOR'::seguridad_vial.estado_version,
                 'OBSERVADA'::seguridad_vial.estado_version,
                 'EN_REVISION'::seguridad_vial.estado_version
               )
             ORDER BY numero_version DESC
             LIMIT 1`,
            [cronogramaId],
          );

          if (draft.rows[0]?.estado === 'EN_REVISION') {
            throw new BadRequestException(
              'Ya hay una versión PLANIFICADA en revisión. Devolvéla a borrador antes de regenerar.',
            );
          }

          if (draft.rows[0]) {
            // PLANIFICADA no admite BORRADOR→CERRADA: se reutiliza el borrador.
            versionId = draft.rows[0].id;
            numero = Number(draft.rows[0].numero_version);
            reused = true;

            if (draft.rows[0].estado === 'OBSERVADA') {
              await client.query(
                `UPDATE seguridad_vial.cronograma_version
                 SET estado = 'BORRADOR'::seguridad_vial.estado_version,
                     observaciones_revision = coalesce(observaciones_revision, '') ||
                       E'\n[motor] Regenerada proyección'
                 WHERE id = $1`,
                [versionId],
              );
            }

            if (wipe) {
              await client.query(
                `DELETE FROM seguridad_vial.cobertura_dia WHERE version_id = $1`,
                [versionId],
              );
              await client.query(
                `DELETE FROM seguridad_vial.dia_cronograma WHERE version_id = $1`,
                [versionId],
              );
              await client.query(
                `UPDATE seguridad_vial.cronograma_version
                 SET motivo_cambio = 'Regeneración por motor de reglas 5×3',
                     derivada_de_version_id = $2
                 WHERE id = $1`,
                [versionId, baseVersionId],
              );
            }
          } else if (contiguo) {
            versionId = contiguo.version_id;
            numero = Number(contiguo.numero_version);
            reused = true;
          } else {
            const ver = await client.query<{ n: number }>(
              `SELECT coalesce(max(numero_version), 0)::int AS n
               FROM seguridad_vial.cronograma_version WHERE cronograma_id = $1`,
              [cronogramaId],
            );
            numero = Number(ver.rows[0].n) + 1;
            const versionIns = await client.query<{ id: string }>(
              `INSERT INTO seguridad_vial.cronograma_version(
                 cronograma_id, numero_version, estado, derivada_de_version_id,
                 creada_por, motivo_cambio
               ) VALUES (
                 $1, $2, 'BORRADOR'::seguridad_vial.estado_version, $3, $4,
                 'Generación por motor de reglas 5×3'
               ) RETURNING id`,
              [cronogramaId, numero, baseVersionId, userId],
            );
            versionId = versionIns.rows[0].id;
          }
        } else {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO seguridad_vial.cronograma(
               codigo, nombre, capa, periodo_desde, periodo_hasta, creado_por
             ) VALUES ($1,$2,'PLANIFICADA'::seguridad_vial.tipo_capa,$3,$4,$5)
             RETURNING id`,
            [
              codigo,
              `Proyección motor ${dateFrom} → ${dateTo}`,
              dateFrom,
              dateTo,
              userId,
            ],
          );
          cronogramaId = ins.rows[0].id;
          numero = 1;
          const versionIns = await client.query<{ id: string }>(
            `INSERT INTO seguridad_vial.cronograma_version(
               cronograma_id, numero_version, estado, derivada_de_version_id,
               creada_por, motivo_cambio
             ) VALUES (
               $1, $2, 'BORRADOR'::seguridad_vial.estado_version, $3, $4,
               'Generación por motor de reglas 5×3'
             ) RETURNING id`,
            [cronogramaId, numero, baseVersionId, userId],
          );
          versionId = versionIns.rows[0].id;
        }

        await client.query(
          `INSERT INTO seguridad_vial.dia_cronograma(
             version_id, fecha_operativa, posicion_id,
             inspector_titular_id, inspector_asignado_id,
             tipo_dia, turno, movil_id, codigo, origen, dia_origen_id
           )
           SELECT $1, d.fecha_operativa, d.posicion_id,
                  d.inspector_titular_id, d.inspector_asignado_id,
                  d.tipo_dia, d.turno, d.movil_id, d.codigo,
                  'GENERADO'::seguridad_vial.origen_registro, d.id
           FROM seguridad_vial.dia_cronograma d
           WHERE d.version_id = $2
             AND d.fecha_operativa >= $3
             AND d.fecha_operativa <= $4
             AND NOT EXISTS (
               SELECT 1 FROM seguridad_vial.dia_cronograma x
               WHERE x.version_id = $1
                 AND x.posicion_id = d.posicion_id
                 AND x.fecha_operativa = d.fecha_operativa
             )`,
          [versionId, baseVersionId, dateFrom, dateTo],
        );

        let inserted = 0;
        for (const day of allDays) {
          const exists = await client.query(
            `SELECT 1 FROM seguridad_vial.dia_cronograma
             WHERE version_id = $1 AND posicion_id = $2 AND fecha_operativa = $3`,
            [versionId, day.positionId, day.date],
          );
          if (exists.rowCount) continue;
          if (!day.inspectorId) continue;

          const movilId =
            day.mobile !== null ? (mobileByNumber.get(day.mobile) ?? null) : null;
          await client.query(
            `INSERT INTO seguridad_vial.dia_cronograma(
               version_id, fecha_operativa, posicion_id,
               inspector_titular_id, inspector_asignado_id,
               tipo_dia, turno, movil_id, codigo, origen
             ) VALUES (
               $1::uuid, $2::date, $3::uuid,
               $4::uuid,
               $5::uuid,
               $6::seguridad_vial.tipo_dia,
               $7::seguridad_vial.turno_codigo,
               $8::uuid,
               $9,
               'GENERADO'::seguridad_vial.origen_registro
             )`,
            [
              versionId,
              day.date,
              day.positionId,
              day.inspectorId,
              day.dayType === 'TRABAJO' ? day.inspectorId : null,
              day.dayType,
              day.shift,
              movilId,
              day.code,
            ],
          );
          inserted += 1;
        }

        await client.query(
          `CALL seguridad_vial.sp_refrescar_cobertura($1::uuid)`,
          [versionId],
        );
        await client.query(
          `UPDATE seguridad_vial.cronograma SET version_actual_id = $1 WHERE id = $2`,
          [versionId, cronogramaId],
        );
        await client.query(`SELECT set_config('app.materializing', 'off', true)`);

        return {
          cronograma_id: cronogramaId,
          version_id: versionId,
          numero_version: numero,
          codigo,
          reused_draft: reused,
          date_from: dateFrom,
          date_to: dateTo,
          days_projected: allDays.length,
          days_inserted: inserted,
          positions: inputs.length,
        };
      },
      { userId, changeReason: 'Proyección motor de cuadratura' },
    );
  }

  /**
   * Tabula rasa: elimina toda la capa PLANIFICADA (versiones y días).
   * No toca BASE ni REAL. Permite regenerar proyección limpia.
   */
  async wipePlanificada(userId: string, reason: string) {
    const motivo = (reason || '').trim();
    if (!motivo) {
      throw new BadRequestException('Indicá un motivo para la tabula rasa');
    }
    const before = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n
       FROM seguridad_vial.cronograma WHERE capa = 'PLANIFICADA'`,
    );
    await this.db.withClient(
      async (client) => {
        await client.query(
          `CALL seguridad_vial.sp_tabula_rasa_planificada($1::uuid, $2)`,
          [userId, motivo],
        );
      },
      { userId, changeReason: `Tabula rasa PLANIFICADA: ${motivo}` },
    );
    return {
      wiped: true,
      cronogramas_eliminados: Number(before.rows[0]?.n ?? 0),
      reason: motivo,
      next: 'Ejecutá preview/apply para regenerar PLANIFICADA. Overlays Haro–Ramos → capa REAL.',
    };
  }

  /**
   * Crea (o regenera borrador) capa REAL derivada de la PLANIFICADA vigente,
   * copiando días del plan y aplicando asignacion_operativa (dupla Haro–Ramos, etc.).
   */
  async applyReal(dateFrom: string, dateTo: string, userId: string) {
    this.assertRange(dateFrom, dateTo);

    const plan = await this.db.query<{
      version_id: string;
      cronograma_id: string;
      codigo: string;
    }>(
      `SELECT v.id AS version_id, c.id AS cronograma_id, c.codigo
       FROM seguridad_vial.cronograma_version v
       JOIN seguridad_vial.cronograma c ON c.id = v.cronograma_id
       WHERE c.capa = 'PLANIFICADA'
         AND v.estado IN (
           'BORRADOR'::seguridad_vial.estado_version,
           'EN_REVISION'::seguridad_vial.estado_version,
           'OBSERVADA'::seguridad_vial.estado_version,
           'APROBADA_PUBLICADA'::seguridad_vial.estado_version
         )
         AND c.periodo_desde <= $2::date
         AND c.periodo_hasta >= $1::date
       ORDER BY
         CASE v.estado
           WHEN 'APROBADA_PUBLICADA' THEN 0
           WHEN 'EN_REVISION' THEN 1
           WHEN 'OBSERVADA' THEN 2
           ELSE 3
         END,
         v.creada_en DESC
       LIMIT 1`,
      [dateFrom, dateTo],
    );
    if (!plan.rows[0]) {
      throw new NotFoundException(
        'No hay versión PLANIFICADA que cubra el rango. Generá el plan primero.',
      );
    }
    const planVersionId = plan.rows[0].version_id;

    const mobiles = await this.db.query<{ id: string; numero: number }>(
      `SELECT id, numero FROM seguridad_vial.movil WHERE estado = 'ACTIVO'`,
    );
    const mobileByNumber = new Map(
      mobiles.rows.map((m) => [Number(m.numero), m.id]),
    );

    const exceptions = await this.loadOperationalExceptions(dateFrom, dateTo);

    return this.db.withClient(
      async (client) => {
        await client.query(`SELECT set_config('app.materializing', 'on', true)`);
        await client.query(`SELECT set_config('app.real_from_plan_draft', 'on', true)`);

        let codigo = `REAL-${dateFrom.replace(/-/g, '')}-${dateTo.replace(/-/g, '')}`;
        let cronogramaId: string;
        let versionId: string;
        let numero: number;
        let reused = false;
        let wipe = false;

        const existing = await client.query<{ id: string }>(
          `SELECT id FROM seguridad_vial.cronograma WHERE codigo = $1`,
          [codigo],
        );
        const contiguo = existing.rows[0]
          ? null
          : await lookupContiguo(client, 'REAL', dateFrom, dateTo);

        if (existing.rows[0] || contiguo) {
          cronogramaId = existing.rows[0]?.id ?? contiguo!.id;
          if (contiguo) codigo = contiguo.codigo;
          wipe = Boolean(existing.rows[0]);
          await client.query(
            `UPDATE seguridad_vial.cronograma
             SET periodo_desde = least(periodo_desde, $2::date),
                 periodo_hasta = greatest(periodo_hasta, $3::date)
             WHERE id = $1`,
            [cronogramaId, dateFrom, dateTo],
          );
          const draft = await client.query<{
            id: string;
            numero_version: number;
            estado: string;
          }>(
            `SELECT id, numero_version, estado::text AS estado
             FROM seguridad_vial.cronograma_version
             WHERE cronograma_id = $1
               AND estado IN (
                 'BORRADOR'::seguridad_vial.estado_version,
                 'OBSERVADA'::seguridad_vial.estado_version
               )
             ORDER BY numero_version DESC LIMIT 1`,
            [cronogramaId],
          );
          if (draft.rows[0]) {
            versionId = draft.rows[0].id;
            numero = Number(draft.rows[0].numero_version);
            reused = true;
            if (draft.rows[0].estado === 'OBSERVADA') {
              await client.query(
                `UPDATE seguridad_vial.cronograma_version
                 SET estado = 'BORRADOR'::seguridad_vial.estado_version
                 WHERE id = $1`,
                [versionId],
              );
            }
            if (wipe) {
              await client.query(
                `DELETE FROM seguridad_vial.cobertura_dia WHERE version_id = $1`,
                [versionId],
              );
              await client.query(
                `DELETE FROM seguridad_vial.dia_cronograma WHERE version_id = $1`,
                [versionId],
              );
              await client.query(
                `UPDATE seguridad_vial.cronograma_version
                 SET derivada_de_version_id = $2,
                     motivo_cambio = 'Regeneración REAL con overlays operativos'
                 WHERE id = $1`,
                [versionId, planVersionId],
              );
            }
          } else if (contiguo) {
            versionId = contiguo.version_id;
            numero = Number(contiguo.numero_version);
            reused = true;
          } else {
            const ver = await client.query<{ n: number }>(
              `SELECT coalesce(max(numero_version), 0)::int AS n
               FROM seguridad_vial.cronograma_version WHERE cronograma_id = $1`,
              [cronogramaId],
            );
            numero = Number(ver.rows[0].n) + 1;
            const insV = await client.query<{ id: string }>(
              `INSERT INTO seguridad_vial.cronograma_version(
                 cronograma_id, numero_version, estado, derivada_de_version_id,
                 creada_por, motivo_cambio
               ) VALUES (
                 $1, $2, 'BORRADOR'::seguridad_vial.estado_version, $3, $4,
                 'Capa REAL: plan + asignaciones operativas (dupla Haro–Ramos)'
               ) RETURNING id`,
              [cronogramaId, numero, planVersionId, userId],
            );
            versionId = insV.rows[0].id;
          }
        } else {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO seguridad_vial.cronograma(
               codigo, nombre, capa, periodo_desde, periodo_hasta, creado_por
             ) VALUES ($1,$2,'REAL'::seguridad_vial.tipo_capa,$3,$4,$5)
             RETURNING id`,
            [
              codigo,
              `Real operativa ${dateFrom} → ${dateTo}`,
              dateFrom,
              dateTo,
              userId,
            ],
          );
          cronogramaId = ins.rows[0].id;
          numero = 1;
          const insV = await client.query<{ id: string }>(
            `INSERT INTO seguridad_vial.cronograma_version(
               cronograma_id, numero_version, estado, derivada_de_version_id,
               creada_por, motivo_cambio
             ) VALUES (
               $1, $2, 'BORRADOR'::seguridad_vial.estado_version, $3, $4,
               'Capa REAL: plan + asignaciones operativas (dupla Haro–Ramos)'
             ) RETURNING id`,
            [cronogramaId, numero, planVersionId, userId],
          );
          versionId = insV.rows[0].id;
        }

        await client.query(
          `INSERT INTO seguridad_vial.dia_cronograma(
             version_id, fecha_operativa, posicion_id,
             inspector_titular_id, inspector_asignado_id,
             tipo_dia, turno, movil_id, codigo, origen, dia_origen_id
           )
           SELECT $1, d.fecha_operativa, d.posicion_id,
                  d.inspector_titular_id, d.inspector_asignado_id,
                  d.tipo_dia, d.turno, d.movil_id, d.codigo,
                  'REAL'::seguridad_vial.origen_registro, d.id
           FROM seguridad_vial.dia_cronograma d
           WHERE d.version_id = $2
             AND d.fecha_operativa >= $3::date
             AND d.fecha_operativa <= $4::date
             AND NOT EXISTS (
               SELECT 1 FROM seguridad_vial.dia_cronograma x
               WHERE x.version_id = $1
                 AND x.posicion_id = d.posicion_id
                 AND x.fecha_operativa = d.fecha_operativa
             )`,
          [versionId, planVersionId, dateFrom, dateTo],
        );

        const planDays = await client.query<{
          fecha_operativa: string;
          posicion_id: string;
          inspector_id: string | null;
          tipo_dia: string;
          turno: string | null;
          movil: number | null;
          codigo: string;
          position_code: string;
          inspector_name: string | null;
        }>(
          `SELECT d.fecha_operativa::text AS fecha_operativa,
                  d.posicion_id,
                  coalesce(d.inspector_asignado_id, d.inspector_titular_id) AS inspector_id,
                  d.tipo_dia::text, d.turno::text, m.numero AS movil, d.codigo,
                  p.codigo AS position_code,
                  i.nombre_completo AS inspector_name
           FROM seguridad_vial.dia_cronograma d
           JOIN seguridad_vial.posicion_cuadratura p ON p.id = d.posicion_id
           LEFT JOIN seguridad_vial.movil m ON m.id = d.movil_id
           LEFT JOIN seguridad_vial.inspector i
             ON i.id = coalesce(d.inspector_asignado_id, d.inspector_titular_id)
           WHERE d.version_id = $1`,
          [versionId],
        );

        const projected: ProjectedDay[] = planDays.rows.map((row) => ({
          date: row.fecha_operativa.slice(0, 10),
          positionCode: row.position_code,
          positionId: row.posicion_id,
          inspectorId: row.inspector_id,
          inspectorName: row.inspector_name,
          dayType: row.tipo_dia as ProjectedDay['dayType'],
          shift: (row.turno as ShiftCode | null) ?? null,
          mobile: row.movil === null ? null : Number(row.movil),
          code: row.codigo,
          cyclePosition: 0,
        }));

        const withOps = applyOperationalExceptions(projected, exceptions);
        let overlaysApplied = 0;
        for (const day of withOps) {
          if (!day.operationalExceptionId) continue;
          const movilId =
            day.mobile !== null ? (mobileByNumber.get(day.mobile) ?? null) : null;
          await client.query(
            `UPDATE seguridad_vial.dia_cronograma
             SET tipo_dia = $4::seguridad_vial.tipo_dia,
                 turno = $5::seguridad_vial.turno_codigo,
                 movil_id = $6::uuid,
                 codigo = $7,
                 inspector_asignado_id = CASE
                   WHEN $4::text = 'TRABAJO' THEN inspector_titular_id
                   ELSE NULL
                 END
             WHERE version_id = $1 AND posicion_id = $2 AND fecha_operativa = $3::date`,
            [
              versionId,
              day.positionId,
              day.date,
              day.dayType,
              day.shift,
              movilId,
              day.code,
            ],
          );
          overlaysApplied += 1;
        }

        await client.query(
          `CALL seguridad_vial.sp_refrescar_cobertura($1::uuid)`,
          [versionId],
        );
        await client.query(
          `UPDATE seguridad_vial.cronograma SET version_actual_id = $1 WHERE id = $2`,
          [versionId, cronogramaId],
        );
        await client.query(`SELECT set_config('app.real_from_plan_draft', 'off', true)`);
        await client.query(`SELECT set_config('app.materializing', 'off', true)`);

        return {
          layer: 'REAL' as const,
          cronograma_id: cronogramaId,
          version_id: versionId,
          numero_version: numero,
          codigo,
          reused_draft: reused,
          derived_from_plan: plan.rows[0].codigo,
          plan_version_id: planVersionId,
          date_from: dateFrom,
          date_to: dateTo,
          days_copied: planDays.rowCount ?? 0,
          overlays_applied: overlaysApplied,
          operational_exceptions: exceptions.length,
        };
      },
      { userId, changeReason: 'Materialización REAL con overlays operativos' },
    );
  }

  /**
   * Registra intercambio operativo Haro–Ramos (INTERCAMBIO_M4_MENSUAL)
   * para el rango: cada uno recibe el móvil del otro según la PLANIFICADA.
   * No altera la cuadratura base ni la PLAN.
   */
  async registerLinkedPairSwap(
    dateFrom: string,
    dateTo: string,
    userId: string,
    reason?: string,
  ) {
    this.assertRange(dateFrom, dateTo);
    const motivo =
      (reason || '').trim() ||
      `Intercambio operativo dupla Haro–Ramos ${dateFrom}→${dateTo}`;

    const plan = await this.db.query<{ version_id: string }>(
      `SELECT v.id AS version_id
       FROM seguridad_vial.cronograma_version v
       JOIN seguridad_vial.cronograma c ON c.id = v.cronograma_id
       WHERE c.capa = 'PLANIFICADA'
       ORDER BY v.creada_en DESC
       LIMIT 1`,
    );
    if (!plan.rows[0]) {
      throw new NotFoundException('No hay PLANIFICADA para tomar móviles de referencia');
    }

    const members = await this.db.query<{
      inspector_id: string;
      nombre: string;
      rol: string;
      movil: number | null;
    }>(
      `SELECT i.id AS inspector_id, i.nombre_completo AS nombre, mg.rol::text AS rol,
              (
                SELECT m.numero
                FROM seguridad_vial.dia_cronograma d
                JOIN seguridad_vial.movil m ON m.id = d.movil_id
                WHERE d.version_id = $1
                  AND d.inspector_titular_id = i.id
                  AND d.tipo_dia = 'TRABAJO'
                  AND d.fecha_operativa >= $2::date
                  AND d.fecha_operativa <= $3::date
                ORDER BY d.fecha_operativa
                LIMIT 1
              ) AS movil
       FROM seguridad_vial.grupo_rotacion_vinculada g
       JOIN seguridad_vial.miembro_grupo_rotacion_vinculada mg ON mg.grupo_id = g.id
       JOIN seguridad_vial.asignacion_inspector_posicion a
         ON a.posicion_id = mg.posicion_id
        AND $2::date <@ a.vigencia
       JOIN seguridad_vial.inspector i ON i.id = a.inspector_id
       WHERE g.codigo = 'GRV-M4-P03' AND g.estado = 'ACTIVO'`,
      [plan.rows[0].version_id, dateFrom, dateTo],
    );

    if (members.rows.length < 2) {
      throw new BadRequestException(
        'No se encontró la dupla Haro–Ramos (GRV-M4-P03) con ocupantes vigentes',
      );
    }
    const a = members.rows[0];
    const b = members.rows[1];
    if (a.movil == null || b.movil == null) {
      throw new BadRequestException(
        'La PLANIFICADA no tiene días TRABAJO de la dupla en el rango para calcular el intercambio',
      );
    }

    const mobileIds = await this.db.query<{ id: string; numero: number }>(
      `SELECT id, numero FROM seguridad_vial.movil WHERE numero = ANY($1::int[])`,
      [[a.movil, b.movil]],
    );
    const idByNum = new Map(mobileIds.rows.map((m) => [Number(m.numero), m.id]));

    // Cerrar overlays previos solapados del mismo tipo
    await this.db.query(
      `UPDATE seguridad_vial.asignacion_operativa
       SET estado = 'ANULADA'
       WHERE tipo = 'INTERCAMBIO_M4_MENSUAL'
         AND estado = 'ACTIVA'
         AND inspector_id = ANY($1::uuid[])
         AND fecha_desde <= $3::date
         AND (fecha_hasta IS NULL OR fecha_hasta >= $2::date)`,
      [[a.inspector_id, b.inspector_id], dateFrom, dateTo],
    );

    const ins = await this.db.query<{ id: string; inspector_id: string }>(
      `INSERT INTO seguridad_vial.asignacion_operativa(
         inspector_id, tipo, fecha_desde, fecha_hasta, movil_id, motivo, creada_por
       ) VALUES
         ($1, 'INTERCAMBIO_M4_MENSUAL', $3::date, $4::date, $5::uuid, $6, $7),
         ($2, 'INTERCAMBIO_M4_MENSUAL', $3::date, $4::date, $8::uuid, $6, $7)
       RETURNING id, inspector_id`,
      [
        a.inspector_id,
        b.inspector_id,
        dateFrom,
        dateTo,
        idByNum.get(Number(b.movil)), // A recibe móvil de B
        motivo,
        userId,
        idByNum.get(Number(a.movil)), // B recibe móvil de A
      ],
    );

    return {
      registered: true,
      date_from: dateFrom,
      date_to: dateTo,
      pair: [
        { inspector: a.nombre, from_mobile: a.movil, to_mobile: b.movil },
        { inspector: b.nombre, from_mobile: b.movil, to_mobile: a.movil },
      ],
      asignacion_ids: ins.rows.map((r) => r.id),
      next: 'Ejecutá apply-real para materializar el intercambio en capa REAL.',
    };
  }

  /**
   * Enroque operativo entre dos inspectores (cualquier par).
   * Inserta overlays día a día en asignacion_operativa (CAMBIO_TURNO) tomando
   * destino del otro desde PLANIFICADA. No muta la cuadratura ideal.
   */
  async registerInspectorSwap(input: {
    inspectorAId: string;
    inspectorBId: string;
    dateFrom: string;
    dateTo: string;
    userId: string;
    reason?: string;
    rematerialize?: boolean;
  }) {
    const {
      inspectorAId,
      inspectorBId,
      dateFrom,
      dateTo,
      userId,
      rematerialize = true,
    } = input;
    this.assertRange(dateFrom, dateTo);
    if (inspectorAId === inspectorBId) {
      throw new BadRequestException('Elegí dos inspectores distintos para el enroque');
    }

    const motivo =
      (input.reason || '').trim() ||
      `Enroque operativo ${dateFrom}→${dateTo}`;

    const plan = await this.latestPlanVersionId(dateFrom, dateTo);
    const days = await this.db.query<{
      fecha: string;
      inspector_id: string;
      tipo_dia: string;
      turno: string | null;
      movil_id: string | null;
      movil: number | null;
      nombre: string;
    }>(
      `SELECT d.fecha_operativa::text AS fecha,
              i.id AS inspector_id,
              d.tipo_dia::text,
              d.turno::text,
              d.movil_id,
              m.numero AS movil,
              i.nombre_completo AS nombre
       FROM seguridad_vial.dia_cronograma d
       JOIN seguridad_vial.inspector i
         ON i.id = coalesce(d.inspector_asignado_id, d.inspector_titular_id)
       LEFT JOIN seguridad_vial.movil m ON m.id = d.movil_id
       WHERE d.version_id = $1
         AND i.id = ANY($2::uuid[])
         AND d.fecha_operativa >= $3::date
         AND d.fecha_operativa <= $4::date
       ORDER BY d.fecha_operativa, i.nombre_completo`,
      [plan, [inspectorAId, inspectorBId], dateFrom, dateTo],
    );

    if (!days.rows.length) {
      throw new BadRequestException(
        'No hay días en la cuadratura ideal para esos inspectores en el rango',
      );
    }

    const byKey = new Map(
      days.rows.map((r) => [`${r.inspector_id}|${r.fecha.slice(0, 10)}`, r]),
    );
    const nameA =
      days.rows.find((r) => r.inspector_id === inspectorAId)?.nombre ?? 'A';
    const nameB =
      days.rows.find((r) => r.inspector_id === inspectorBId)?.nombre ?? 'B';

    const dates = [
      ...new Set(days.rows.map((r) => r.fecha.slice(0, 10))),
    ].sort();

    const overlays: Array<{
      inspectorId: string;
      date: string;
      tipoDia: string;
      turno: string | null;
      movilId: string | null;
    }> = [];

    for (const fecha of dates) {
      const a = byKey.get(`${inspectorAId}|${fecha}`);
      const b = byKey.get(`${inspectorBId}|${fecha}`);
      if (!a || !b) continue;

      overlays.push({
        inspectorId: inspectorAId,
        date: fecha,
        tipoDia: b.tipo_dia,
        turno: b.tipo_dia === 'TRABAJO' ? b.turno : null,
        movilId: b.tipo_dia === 'TRABAJO' ? b.movil_id : null,
      });
      overlays.push({
        inspectorId: inspectorBId,
        date: fecha,
        tipoDia: a.tipo_dia,
        turno: a.tipo_dia === 'TRABAJO' ? a.turno : null,
        movilId: a.tipo_dia === 'TRABAJO' ? a.movil_id : null,
      });
    }

    if (!overlays.length) {
      throw new BadRequestException(
        'No hay días compartidos entre ambos inspectores en el rango',
      );
    }

    await this.db.query(
      `UPDATE seguridad_vial.asignacion_operativa
       SET estado = 'ANULADA'
       WHERE tipo IN ('CAMBIO_TURNO', 'CAMBIO_MOVIL')
         AND estado = 'ACTIVA'
         AND inspector_id = ANY($1::uuid[])
         AND fecha_desde <= $3::date
         AND (fecha_hasta IS NULL OR fecha_hasta >= $2::date)`,
      [[inspectorAId, inspectorBId], dateFrom, dateTo],
    );

    const ids: string[] = [];
    for (const o of overlays) {
      const ins = await this.db.query<{ id: string }>(
        `INSERT INTO seguridad_vial.asignacion_operativa(
           inspector_id, tipo, fecha_desde, fecha_hasta,
           tipo_dia, turno, movil_id, motivo, creada_por
         ) VALUES (
           $1, 'CAMBIO_TURNO', $2::date, $2::date,
           $3::seguridad_vial.tipo_dia,
           $4::seguridad_vial.turno_codigo,
           $5::uuid, $6, $7
         ) RETURNING id`,
        [
          o.inspectorId,
          o.date,
          o.tipoDia,
          o.turno,
          o.movilId,
          `${motivo} (${nameA} ⇄ ${nameB})`,
          userId,
        ],
      );
      ids.push(ins.rows[0].id);
    }

    let real: unknown = null;
    if (rematerialize) {
      real = await this.applyReal(dateFrom, dateTo, userId);
    }

    return {
      registered: true,
      date_from: dateFrom,
      date_to: dateTo,
      pair: [nameA, nameB],
      days_swapped: dates.length,
      asignacion_ids: ids,
      plan_preserved: true,
      real,
    };
  }

  /**
   * Ausencia operativa (vacación / licencia / feriado / enfermedad) como overlay.
   * No altera PLANIFICADA; rematerializa REAL si se pide.
   */
  async registerOperationalAbsence(input: {
    inspectorId: string;
    dateFrom: string;
    dateTo: string;
    kind: 'VACACION' | 'LICENCIA' | 'FERIADO' | 'ENFERMEDAD';
    userId: string;
    reason?: string;
    catalogoLicenciaId?: string;
    rematerialize?: boolean;
  }) {
    const {
      inspectorId,
      dateFrom,
      dateTo,
      kind,
      userId,
      rematerialize = true,
    } = input;
    this.assertRange(dateFrom, dateTo);

    let catalogoLicenciaId: string | null = null;
    let licenciaNombre = '';
    if (kind === 'LICENCIA') {
      if (!input.catalogoLicenciaId) {
        throw new BadRequestException(
          'Elegí un tipo de licencia de Administración → Licencias',
        );
      }
      const lic = await this.db.query<{ id: string; nombre: string }>(
        `SELECT id, nombre FROM seguridad_vial.catalogo_licencia
         WHERE id = $1 AND activo = true`,
        [input.catalogoLicenciaId],
      );
      if (!lic.rows[0]) {
        throw new BadRequestException('Ese tipo de licencia no existe o está inactivo');
      }
      catalogoLicenciaId = lic.rows[0].id;
      licenciaNombre = lic.rows[0].nombre;
    }

    const tipoDia =
      kind === 'FERIADO' ? 'FRANCO' : kind === 'VACACION' ? 'VACACION' : kind;
    const motivo =
      (input.reason || '').trim() ||
      (licenciaNombre
        ? `${licenciaNombre} ${dateFrom}→${dateTo}`
        : `${kind} operativa ${dateFrom}→${dateTo}`);

    const exists = await this.db.query(
      `SELECT 1 FROM seguridad_vial.inspector
       WHERE id = $1 AND estado = 'ACTIVO' AND tipo_plantel <> 'PEAJISTA'`,
      [inspectorId],
    );
    if (!exists.rows[0]) {
      throw new NotFoundException('Inspector no encontrado o inactivo');
    }

    await this.db.query(
      `UPDATE seguridad_vial.asignacion_operativa
       SET estado = 'ANULADA'
       WHERE tipo = 'LICENCIA'
         AND estado = 'ACTIVA'
         AND inspector_id = $1
         AND fecha_desde <= $3::date
         AND (fecha_hasta IS NULL OR fecha_hasta >= $2::date)`,
      [inspectorId, dateFrom, dateTo],
    );

    const ins = await this.db.query<{ id: string }>(
      `INSERT INTO seguridad_vial.asignacion_operativa(
         inspector_id, tipo, fecha_desde, fecha_hasta,
         tipo_dia, motivo, creada_por, catalogo_licencia_id
       ) VALUES (
         $1, 'LICENCIA', $2::date, $3::date,
         $4::seguridad_vial.tipo_dia, $5, $6, $7
       ) RETURNING id`,
      [inspectorId, dateFrom, dateTo, tipoDia, motivo, userId, catalogoLicenciaId],
    );

    let real: unknown = null;
    if (rematerialize) {
      real = await this.applyReal(dateFrom, dateTo, userId);
    }

    return {
      registered: true,
      kind,
      tipo_dia: tipoDia,
      date_from: dateFrom,
      date_to: dateTo,
      asignacion_id: ins.rows[0].id,
      plan_preserved: true,
      real,
    };
  }

  /**
   * Cambio de turno y/o móvil por un rango de fechas (overlay REAL).
   *
   * Se puede mandar solo el turno, solo el móvil, o los dos. Lo que no venga se
   * conserva de la cuadratura base. Como toda asignación operativa, no avanza ni
   * recalcula la secuencia: al terminar el rango el inspector vuelve a su plan.
   */
  async registerOperationalAssignment(input: {
    inspectorId: string;
    dateFrom: string;
    dateTo: string;
    shift?: 'M' | 'T' | 'N' | null;
    mobile?: number | null;
    userId: string;
    reason?: string;
    rematerialize?: boolean;
  }) {
    const {
      inspectorId,
      dateFrom,
      dateTo,
      shift = null,
      mobile = null,
      userId,
      rematerialize = true,
    } = input;
    this.assertRange(dateFrom, dateTo);

    if (!shift && mobile === null) {
      throw new BadRequestException(
        'Indicá al menos un turno o un móvil para el cambio.',
      );
    }

    const inspector = await this.db.query(
      `SELECT 1 FROM seguridad_vial.inspector
       WHERE id = $1 AND estado = 'ACTIVO' AND tipo_plantel <> 'PEAJISTA'`,
      [inspectorId],
    );
    if (!inspector.rows[0]) {
      throw new NotFoundException('Inspector no encontrado o inactivo');
    }

    let movilId: string | null = null;
    if (mobile !== null) {
      const m = await this.db.query<{ id: string }>(
        `SELECT id FROM seguridad_vial.movil
         WHERE numero = $1 AND estado = 'ACTIVO'`,
        [mobile],
      );
      if (!m.rows[0]) {
        throw new NotFoundException(`El móvil ${mobile} no existe o está inactivo`);
      }
      movilId = m.rows[0].id;
    }

    const tipo = shift && mobile !== null
      ? 'COBERTURA'
      : shift
        ? 'CAMBIO_TURNO'
        : 'CAMBIO_MOVIL';

    const destino = [shift, mobile !== null ? `móvil ${mobile}` : null]
      .filter(Boolean)
      .join(' · ');
    const motivo =
      (input.reason || '').trim() || `Cambio operativo a ${destino} ${dateFrom}→${dateTo}`;

    // Un solo cambio vigente por inspector y rango: el nuevo reemplaza al anterior.
    await this.db.query(
      `UPDATE seguridad_vial.asignacion_operativa
       SET estado = 'ANULADA'
       WHERE tipo IN ('CAMBIO_MOVIL', 'CAMBIO_TURNO', 'COBERTURA')
         AND estado = 'ACTIVA'
         AND inspector_id = $1
         AND fecha_desde <= $3::date
         AND (fecha_hasta IS NULL OR fecha_hasta >= $2::date)`,
      [inspectorId, dateFrom, dateTo],
    );

    const ins = await this.db.query<{ id: string }>(
      `INSERT INTO seguridad_vial.asignacion_operativa(
         inspector_id, tipo, fecha_desde, fecha_hasta,
         turno, movil_id, motivo, creada_por
       ) VALUES (
         $1, $2, $3::date, $4::date,
         $5::seguridad_vial.turno_codigo, $6, $7, $8
       ) RETURNING id`,
      [inspectorId, tipo, dateFrom, dateTo, shift, movilId, motivo, userId],
    );

    let real: unknown = null;
    if (rematerialize) {
      real = await this.applyReal(dateFrom, dateTo, userId);
    }

    return {
      registered: true,
      tipo,
      shift,
      mobile,
      date_from: dateFrom,
      date_to: dateTo,
      asignacion_id: ins.rows[0].id,
      plan_preserved: true,
      real,
    };
  }

  private async latestPlanVersionId(dateFrom: string, dateTo: string) {
    const plan = await this.db.query<{ version_id: string }>(
      `SELECT v.id AS version_id
       FROM seguridad_vial.cronograma_version v
       JOIN seguridad_vial.cronograma c ON c.id = v.cronograma_id
       WHERE c.capa = 'PLANIFICADA'
         AND c.periodo_desde <= $2::date
         AND c.periodo_hasta >= $1::date
       ORDER BY
         CASE v.estado
           WHEN 'APROBADA_PUBLICADA' THEN 0
           WHEN 'EN_REVISION' THEN 1
           WHEN 'OBSERVADA' THEN 2
           ELSE 3
         END,
         v.creada_en DESC
       LIMIT 1`,
      [dateFrom, dateTo],
    );
    if (!plan.rows[0]) {
      throw new NotFoundException(
        'No hay PLANIFICADA que cubra el rango para tomar la cuadratura ideal',
      );
    }
    return plan.rows[0].version_id;
  }

  private assertRange(dateFrom: string, dateTo: string) {
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    const from = Date.parse(dateFrom + 'T12:00:00Z');
    const to = Date.parse(dateTo + 'T12:00:00Z');
    const days = Math.round((to - from) / 86_400_000) + 1;
    // Sin límite operativo de planificación (v2.7). Tope de seguridad ~10 años
    // para evitar consumo desmedido en caso de valores accidentales.
    const HARD_CAP = 3660;
    if (days > HARD_CAP) {
      throw new BadRequestException(
        `El rango solicitado (${days} días) supera el tope de seguridad de ${HARD_CAP} días`,
      );
    }
  }

  private async loadProjectionInputs(): Promise<ProjectionInput[]> {
    const result = await this.db.query<{
      posicion_id: string;
      posicion_codigo: string;
      inspector_id: string | null;
      inspector_nombre: string | null;
      fecha_referencia: string;
      posicion_ciclo: number;
      turno: string | null;
      movil: number | null;
      indice_turno: number | null;
      indice_movil: number | null;
      bloques_completados_movil: number | null;
      turnos: string[];
      moviles: number[];
    }>(
      `WITH perfiles AS (
         SELECT pr.id AS perfil_id,
                coalesce(
                  (SELECT array_agg(pt.turno::text ORDER BY pt.orden)
                   FROM seguridad_vial.perfil_rotacion_turno pt
                   WHERE pt.perfil_id = pr.id),
                  ARRAY[]::text[]
                ) AS turnos,
                coalesce(
                  (SELECT array_agg(m.numero::int ORDER BY pm.orden)
                   FROM seguridad_vial.perfil_rotacion_movil pm
                   JOIN seguridad_vial.movil m ON m.id = pm.movil_id
                   WHERE pm.perfil_id = pr.id
                     AND m.estado = 'ACTIVO'),
                  ARRAY[]::int[]
                ) AS moviles
         FROM seguridad_vial.perfil_rotacion pr
       ),
       ocupante AS (
         SELECT DISTINCT ON (a.posicion_id)
                a.posicion_id, a.inspector_id, i.nombre_completo
         FROM seguridad_vial.asignacion_inspector_posicion a
         JOIN seguridad_vial.inspector i ON i.id = a.inspector_id
         WHERE current_date <@ a.vigencia
           AND i.estado = 'ACTIVO'
           AND i.tipo_plantel <> 'PEAJISTA'
         ORDER BY a.posicion_id, a.fecha_desde DESC
       )
       SELECT p.id AS posicion_id,
              p.codigo AS posicion_codigo,
              o.inspector_id,
              o.nombre_completo AS inspector_nombre,
              e.fecha_referencia::text AS fecha_referencia,
              e.posicion_ciclo,
              e.turno::text AS turno,
              m.numero AS movil,
              e.indice_turno,
              e.indice_movil,
              e.bloques_completados_movil,
              pf.turnos,
              pf.moviles
       FROM seguridad_vial.estado_inicial_posicion e
       JOIN seguridad_vial.posicion_cuadratura p ON p.id = e.posicion_id
       JOIN perfiles pf ON pf.perfil_id = p.perfil_rotacion_id
       LEFT JOIN seguridad_vial.movil m
         ON m.id = e.movil_id AND m.estado = 'ACTIVO'
       JOIN ocupante o ON o.posicion_id = p.id
       WHERE p.estado = 'ACTIVO'
       ORDER BY p.codigo`,
    );

    const blocks = await this.db.query<{
      posicion_id: string;
      fecha_desde: string;
      fecha_hasta: string;
      movil: number | null;
      turno: string | null;
    }>(
      `SELECT b.posicion_id,
              b.fecha_desde::text,
              b.fecha_hasta::text,
              m.numero AS movil,
              b.turno::text AS turno
       FROM seguridad_vial.bloque_cuadratura b
       LEFT JOIN seguridad_vial.movil m ON m.id = b.movil_id
       WHERE b.tipo = 'TRABAJO'
       ORDER BY b.posicion_id, b.fecha_desde DESC`,
    );

    const blocksByPos = new Map<string, typeof blocks.rows>();
    for (const b of blocks.rows) {
      const list = blocksByPos.get(b.posicion_id) ?? [];
      list.push(b);
      blocksByPos.set(b.posicion_id, list);
    }

    return result.rows.flatMap((row) => {
      if (!row.inspector_id) return [];
      const shifts = (row.turnos || []).filter(Boolean) as ShiftCode[];
      const mobileList = (row.moviles || []).map(Number).filter((n) => n > 0);
      if (!mobileList.length) return [];
      const shiftList = shifts.length
        ? shifts
        : (['M', 'N', 'T'] as ShiftCode[]);
      const ref = row.fecha_referencia.slice(0, 10);
      const posBlocks = blocksByPos.get(row.posicion_id) ?? [];

      let mobile =
        row.movil !== null ? Number(row.movil) : lastWorkMobile(posBlocks, ref);
      let shift = (row.turno as ShiftCode | null) ?? lastWorkShift(posBlocks, ref);
      if (mobile !== null && !mobileList.includes(mobile)) {
        mobile = mobileList[0];
      }
      let shiftIndex =
        row.indice_turno ??
        (shift ? Math.max(0, shiftList.indexOf(shift)) : 0);
      let mobileIndex =
        mobile !== null ? Math.max(0, mobileList.indexOf(mobile)) : 0;
      if (shiftIndex < 0) shiftIndex = 0;
      if (mobileIndex < 0) mobileIndex = 0;

      const completed =
        row.bloques_completados_movil ??
        countCompletedSameMobileBlocks(posBlocks, ref, mobile);

      return [
        {
          positionCode: row.posicion_codigo,
          positionId: row.posicion_id,
          inspectorId: row.inspector_id,
          inspectorName: row.inspector_nombre,
          referenceDate: ref,
          cyclePosition: Number(row.posicion_ciclo),
          shift,
          mobile,
          shiftIndex,
          mobileIndex,
          shifts: shiftList,
          mobiles: mobileList,
          completedBlocksOnMobile: completed,
        },
      ];
    });
  }

  private async loadOperationalExceptions(dateFrom: string, dateTo: string): Promise<OperationalException[]> {
    const result = await this.db.query<{
      id: string; inspector_id: string; fecha_desde: string; fecha_hasta: string | null;
      tipo_dia: string | null; turno: string | null; movil: number | null;
    }>(
      `SELECT ao.id, ao.inspector_id, ao.fecha_desde::text, ao.fecha_hasta::text,
              ao.tipo_dia::text, ao.turno::text, m.numero AS movil
       FROM seguridad_vial.asignacion_operativa ao
       LEFT JOIN seguridad_vial.movil m ON m.id = ao.movil_id
       WHERE ao.estado = 'ACTIVA' AND ao.fecha_desde <= $2::date
         AND (ao.fecha_hasta IS NULL OR ao.fecha_hasta >= $1::date)
       ORDER BY ao.fecha_desde`,
      [dateFrom, dateTo],
    );
    return result.rows.map((row) => ({
      id: row.id,
      inspectorId: row.inspector_id,
      dateFrom: row.fecha_desde.slice(0, 10),
      dateTo: row.fecha_hasta?.slice(0, 10) ?? null,
      dayType: (row.tipo_dia as OperationalException['dayType']) ?? undefined,
      shift: (row.turno as ShiftCode | null) ?? undefined,
      mobile: row.movil === null ? undefined : Number(row.movil),
    }));
  }
}

function lastWorkMobile(
  blocks: Array<{ fecha_hasta: string; movil: number | null }>,
  ref: string,
): number | null {
  for (const b of blocks) {
    if (b.fecha_hasta.slice(0, 10) <= ref && b.movil !== null) {
      return Number(b.movil);
    }
  }
  return null;
}

function lastWorkShift(
  blocks: Array<{ fecha_hasta: string; turno: string | null }>,
  ref: string,
): ShiftCode | null {
  for (const b of blocks) {
    if (b.fecha_hasta.slice(0, 10) <= ref && b.turno) {
      return b.turno as ShiftCode;
    }
  }
  return null;
}

function countCompletedSameMobileBlocks(
  blocks: Array<{ fecha_desde: string; fecha_hasta: string; movil: number | null }>,
  ref: string,
  mobile: number | null,
): number {
  if (mobile === null) return 0;
  const closed = blocks
    .filter(
      (b) => b.fecha_hasta.slice(0, 10) < ref && Number(b.movil) === mobile,
    )
    .sort((a, b) => b.fecha_hasta.localeCompare(a.fecha_hasta));

  let count = 0;
  let nextStart: string | null = null;
  for (const b of closed) {
    const start = b.fecha_desde.slice(0, 10);
    const end = b.fecha_hasta.slice(0, 10);
    if (nextStart === null) {
      count = 1;
      nextStart = start;
      continue;
    }
    const gap =
      (Date.parse(nextStart + 'T12:00:00Z') - Date.parse(end + 'T12:00:00Z')) /
      86_400_000;
    // Entre bloques: 3 francos (gap 4 desde fin hasta inicio siguiente)
    if (gap >= 1 && gap <= 5) {
      count += 1;
      nextStart = start;
    } else {
      break;
    }
  }
  return count;
}

function summarizeCodes(days: ProjectedDay[]) {
  const map = new Map<string, number>();
  for (const d of days) {
    map.set(d.code, (map.get(d.code) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([code, count]) => ({ code, count }));
}
