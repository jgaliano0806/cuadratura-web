import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

function isPgError(e: unknown): e is { code: string } {
  return typeof e === 'object' && e !== null && 'code' in e;
}

function slugCodigo(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

function colorHex(value?: string | null, required = false): string | null {
  if (value == null || value.trim() === '') {
    if (required) throw new BadRequestException('Elegí un color');
    return null;
  }
  const t = value.trim();
  if (!HEX.test(t)) {
    throw new BadRequestException('El color tiene que ser #RRGGBB');
  }
  return t.toLowerCase();
}

function nombreCompleto(apellido: string, nombres: string): string {
  return `${apellido.trim()}, ${nombres.trim()}`;
}

@Injectable()
export class AdministrationService {
  constructor(private readonly db: DatabaseService) {}

  async overview() {
    const [inspectors, mobiles, positions, versions, users, gaps] =
      await Promise.all([
        this.db.query(
          `SELECT count(*)::int AS n FROM seguridad_vial.inspector WHERE estado = 'ACTIVO'`,
        ),
        this.db.query(
          `SELECT count(*)::int AS n FROM seguridad_vial.movil WHERE estado = 'ACTIVO'`,
        ),
        this.db.query(
          `SELECT count(*)::int AS n FROM seguridad_vial.posicion_cuadratura WHERE estado = 'ACTIVO'`,
        ),
        this.db.query(
          `SELECT count(*)::int AS n FROM seguridad_vial.cronograma_version`,
        ),
        this.db.query(
          `SELECT count(*)::int AS n FROM seguridad_vial.usuario WHERE estado = 'ACTIVO'`,
        ),
        this.db.query(
          `SELECT count(*)::int AS n
           FROM seguridad_vial.cobertura_dia
           WHERE estado = 'HUECO' AND responsable_aceptacion_id IS NULL`,
        ),
      ]);

    return {
      inspectores_activos: inspectors.rows[0].n,
      moviles_activos: mobiles.rows[0].n,
      posiciones_activas: positions.rows[0].n,
      versiones: versions.rows[0].n,
      usuarios_activos: users.rows[0].n,
      huecos_pendientes: gaps.rows[0].n,
    };
  }

  async inspectors() {
    const result = await this.db.query(
      `SELECT i.id,
              i.legajo,
              i.nombres,
              i.apellido,
              i.nombre_completo,
              i.tipo_plantel,
              i.estado,
              a.fecha_desde::text AS vigencia_desde,
              p.codigo AS posicion_codigo,
              CASE
                WHEN p.codigo IS NULL THEN NULL
                WHEN p.tipo = 'MOVIL4' THEN 'Móvil 4 · ' || p.codigo
                WHEN p.tipo = 'MOVIL6' THEN 'Ruta 36 · Móvil 6 · ' || p.codigo
                WHEN p.tipo = 'MOVIL7' THEN 'Ruta 36 · Móvil 7 · ' || p.codigo
                ELSE 'Rotación · ' || p.codigo
              END AS posicion_etiqueta
       FROM seguridad_vial.inspector i
       LEFT JOIN LATERAL (
         SELECT a1.posicion_id, a1.fecha_desde
         FROM seguridad_vial.asignacion_inspector_posicion a1
         WHERE a1.inspector_id = i.id AND current_date <@ a1.vigencia
         ORDER BY a1.fecha_desde DESC LIMIT 1
       ) a ON true
       LEFT JOIN seguridad_vial.posicion_cuadratura p ON p.id = a.posicion_id
       WHERE i.tipo_plantel <> 'PEAJISTA'
       ORDER BY coalesce(i.apellido, i.nombre_completo), coalesce(i.nombres, ''), i.legajo`,
    );
    return result.rows;
  }

  async mobiles() {
    const result = await this.db.query(
      `SELECT m.id,
              m.numero,
              m.capacidad_maxima,
              m.estado,
              m.base_operativa_id,
              m.vigencia_desde::text AS vigencia_desde,
              m.vigencia_hasta::text AS vigencia_hasta,
              b.nombre AS base_nombre,
              coalesce(
                string_agg(
                  h.turno || ' ' || to_char(h.hora_inicio, 'HH24:MI'),
                  ' · ' ORDER BY h.turno
                ),
                '—'
              ) AS horarios_texto
       FROM seguridad_vial.movil m
       JOIN seguridad_vial.base_operativa b ON b.id = m.base_operativa_id
       LEFT JOIN seguridad_vial.horario_turno_movil h
         ON h.movil_id = m.id AND current_date <@ h.vigencia
       GROUP BY m.id, b.nombre
       ORDER BY m.numero`,
    );
    return result.rows;
  }

  async bases() {
    const result = await this.db.query(
      `SELECT id, codigo, nombre
       FROM seguridad_vial.base_operativa
       WHERE estado = 'ACTIVO'
       ORDER BY nombre`,
    );
    return result.rows;
  }

  async createMobile(input: {
    numero: number;
    baseOperativaId: string;
    capacidadMaxima?: number;
    vigenciaDesde?: string;
  }) {
    const numero = Number(input.numero);
    if (!Number.isInteger(numero) || numero < 1 || numero > 99) {
      throw new BadRequestException('El número de móvil debe estar entre 1 y 99');
    }
    const capacidad = input.capacidadMaxima ?? 2;
    if (capacidad < 1 || capacidad > 2) {
      throw new BadRequestException('La capacidad es 1 o 2 inspectores');
    }
    try {
      const result = await this.db.query(
        `INSERT INTO seguridad_vial.movil (
           numero, base_operativa_id, capacidad_maxima, vigencia_desde, estado
         ) VALUES ($1, $2, $3, coalesce($4::date, current_date), 'ACTIVO')
         RETURNING id, numero, capacidad_maxima, estado, base_operativa_id,
                   vigencia_desde::text AS vigencia_desde`,
        [numero, input.baseOperativaId, capacidad, input.vigenciaDesde ?? null],
      );
      const created = result.rows[0];
      await this.db.query(
        `INSERT INTO seguridad_vial.horario_turno_movil (
           movil_id, turno, hora_inicio, duracion_minutos, vigencia_desde
         )
         SELECT $1, h.turno, h.hora_inicio, h.duracion_minutos, coalesce($2::date, current_date)
         FROM seguridad_vial.horario_turno_movil h
         JOIN seguridad_vial.movil m ON m.id = h.movil_id
         WHERE m.numero = 1 AND current_date <@ h.vigencia`,
        [created.id, input.vigenciaDesde ?? null],
      );
      return created;
    } catch (e) {
      if (isPgError(e) && e.code === '23505') {
        throw new ConflictException('Ya existe un móvil con ese número');
      }
      throw e;
    }
  }

  async updateMobile(
    id: string,
    input: {
      baseOperativaId?: string;
      capacidadMaxima?: number;
      estado?: 'ACTIVO' | 'MANTENIMIENTO' | 'FUERA_SERVICIO' | 'REEMPLAZADO';
    },
  ) {
    const current = await this.db.query(
      `SELECT id FROM seguridad_vial.movil WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Móvil no encontrado');
    if (input.capacidadMaxima != null && (input.capacidadMaxima < 1 || input.capacidadMaxima > 2)) {
      throw new BadRequestException('La capacidad es 1 o 2 inspectores');
    }
    const result = await this.db.query(
      `UPDATE seguridad_vial.movil
       SET base_operativa_id = coalesce($2, base_operativa_id),
           capacidad_maxima = coalesce($3, capacidad_maxima),
           estado = coalesce($4, estado),
           vigencia_hasta = CASE
             WHEN $4 IN ('FUERA_SERVICIO', 'REEMPLAZADO') THEN coalesce(vigencia_hasta, current_date)
             WHEN $4 = 'ACTIVO' THEN NULL
             ELSE vigencia_hasta
           END
       WHERE id = $1
       RETURNING id, numero, capacidad_maxima, estado, base_operativa_id,
                 vigencia_desde::text AS vigencia_desde,
                 vigencia_hasta::text AS vigencia_hasta`,
      [
        id,
        input.baseOperativaId ?? null,
        input.capacidadMaxima ?? null,
        input.estado ?? null,
      ],
    );
    return result.rows[0];
  }

  async deactivateMobile(id: string) {
    return this.updateMobile(id, { estado: 'FUERA_SERVICIO' });
  }

  async positions() {
    const result = await this.db.query(
      `SELECT p.codigo,
              coalesce(i.nombre_completo, 'Sin ocupante') AS ocupante_vigente,
              p.tipo,
              p.estado,
              pr.nombre AS perfil,
              gf.codigo AS grupo_franco,
              CASE
                WHEN g.codigo IS NULL THEN NULL
                ELSE coalesce(g.nombre, g.codigo) ||
                     coalesce(' (' || mg.rol || ')', '')
              END AS grupo_vinculado
       FROM seguridad_vial.posicion_cuadratura p
       LEFT JOIN seguridad_vial.grupo_franco gf ON gf.id = p.grupo_franco_id
       LEFT JOIN seguridad_vial.perfil_rotacion pr ON pr.id = p.perfil_rotacion_id
       LEFT JOIN LATERAL (
         SELECT a1.inspector_id
         FROM seguridad_vial.asignacion_inspector_posicion a1
         WHERE a1.posicion_id = p.id AND current_date <@ a1.vigencia
         ORDER BY a1.fecha_desde DESC LIMIT 1
       ) a ON true
       LEFT JOIN seguridad_vial.inspector i ON i.id = a.inspector_id
       LEFT JOIN seguridad_vial.miembro_grupo_rotacion_vinculada mg ON mg.posicion_id = p.id
       LEFT JOIN seguridad_vial.grupo_rotacion_vinculada g ON g.id = mg.grupo_id
       ORDER BY i.nombre_completo NULLS LAST, p.codigo`,
    );
    return result.rows;
  }

  async profiles() {
    const result = await this.db.query(
      `SELECT pr.codigo,
              pr.nombre,
              pr.tipo,
              pr.estado,
              (
                SELECT coalesce(string_agg(pt.turno::text, ' → ' ORDER BY pt.orden), '—')
                FROM seguridad_vial.perfil_rotacion_turno pt WHERE pt.perfil_id = pr.id
              ) AS turnos_texto,
              (
                SELECT coalesce(string_agg(m.numero::text, ' → ' ORDER BY pm.orden), '—')
                FROM seguridad_vial.perfil_rotacion_movil pm
                JOIN seguridad_vial.movil m ON m.id = pm.movil_id
                WHERE pm.perfil_id = pr.id
              ) AS moviles_texto
       FROM seguridad_vial.perfil_rotacion pr
       ORDER BY pr.nombre, pr.codigo`,
    );
    return result.rows;
  }

  async users() {
    const result = await this.db.query(
      `SELECT u.id,
              u.nombre_usuario,
              u.nombre_mostrar,
              u.estado,
              coalesce(
                string_agg(r.nombre, ' · ' ORDER BY r.nombre),
                '—'
              ) AS roles_texto
       FROM seguridad_vial.usuario u
       LEFT JOIN seguridad_vial.usuario_rol ur
         ON ur.usuario_id = u.id
        AND (ur.fecha_hasta IS NULL OR ur.fecha_hasta >= current_date)
       LEFT JOIN seguridad_vial.rol r ON r.id = ur.rol_id
       GROUP BY u.id
       ORDER BY u.nombre_mostrar, u.nombre_usuario`,
    );
    return result.rows;
  }

  async linkedGroups() {
    const result = await this.db.query(
      `SELECT g.id,
              coalesce(g.nombre, g.codigo) AS nombre,
              g.estado,
              string_agg(
                coalesce(i.nombre_completo, p.codigo) ||
                CASE WHEN mg.rol IS NOT NULL THEN ' (' || mg.rol || ')' ELSE '' END,
                ' · ' ORDER BY mg.rol
              ) AS miembros_texto
       FROM seguridad_vial.grupo_rotacion_vinculada g
       JOIN seguridad_vial.miembro_grupo_rotacion_vinculada mg ON mg.grupo_id = g.id
       JOIN seguridad_vial.posicion_cuadratura p ON p.id = mg.posicion_id
       LEFT JOIN LATERAL (
         SELECT a1.inspector_id
         FROM seguridad_vial.asignacion_inspector_posicion a1
         WHERE a1.posicion_id = p.id AND current_date <@ a1.vigencia
         ORDER BY a1.fecha_desde DESC LIMIT 1
       ) a ON true
       LEFT JOIN seguridad_vial.inspector i ON i.id = a.inspector_id
       GROUP BY g.id
       ORDER BY coalesce(g.nombre, g.codigo)`,
    );
    return result.rows;
  }

  async createInspector(input: {
    nombres: string;
    apellido: string;
    legajo: string;
    tipoPlantel?: 'TITULAR' | 'REEMPLAZANTE' | 'PEAJISTA';
    fechaDesde?: string;
    posicionId?: string;
    userId?: string;
  }) {
    const nombres = input.nombres.trim();
    const apellido = input.apellido.trim();
    const legajo = input.legajo.trim();
    if (!nombres || !apellido || !legajo) {
      throw new BadRequestException('Nombre, apellido y legajo son obligatorios');
    }
    const plantel = input.tipoPlantel ?? 'TITULAR';
    const fechaAlta = input.fechaDesde ?? null;
    try {
      const result = await this.db.query(
        `INSERT INTO seguridad_vial.inspector (
           legajo, nombres, apellido, nombre_completo, tipo_plantel, fecha_alta
         ) VALUES (
           $1, $2, $3, $4, $5::seguridad_vial.tipo_plantel,
           coalesce($6::date, current_date)
         )
         RETURNING id, legajo, nombres, apellido, nombre_completo, tipo_plantel, estado,
                   fecha_alta::text AS fecha_alta`,
        [legajo, nombres, apellido, nombreCompleto(apellido, nombres), plantel, fechaAlta],
      );
      const created = result.rows[0];
      if (input.posicionId) {
        await this.assignPosition({
          inspectorId: created.id,
          posicionId: input.posicionId,
          fechaDesde: fechaAlta ?? new Date().toISOString().slice(0, 10),
          motivo: 'Alta de inspector',
          userId: input.userId,
        });
      }
      return created;
    } catch (e) {
      if (isPgError(e) && e.code === '23505') {
        throw new ConflictException('Ya existe alguien con ese legajo');
      }
      throw e;
    }
  }

  async updateInspector(
    id: string,
    input: {
      nombres?: string;
      apellido?: string;
      legajo?: string;
      tipoPlantel?: 'TITULAR' | 'REEMPLAZANTE' | 'PEAJISTA';
      posicionId?: string;
      fechaDesde?: string;
      userId?: string;
    },
  ) {
    const current = await this.db.query(
      `SELECT id, nombres, apellido FROM seguridad_vial.inspector WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Inspector no encontrado');

    const nombres = input.nombres?.trim();
    const apellido = input.apellido?.trim();
    const legajo = input.legajo?.trim();
    const completo =
      nombres || apellido
        ? nombreCompleto(
            apellido || current.rows[0].apellido || '',
            nombres || current.rows[0].nombres || '',
          )
        : null;

    try {
      const result = await this.db.query(
        `UPDATE seguridad_vial.inspector
         SET nombres = coalesce($2, nombres),
             apellido = coalesce($3, apellido),
             nombre_completo = coalesce($4, nombre_completo),
             legajo = coalesce($5, legajo),
             tipo_plantel = coalesce($6::seguridad_vial.tipo_plantel, tipo_plantel),
             actualizado_en = now()
         WHERE id = $1
         RETURNING id, legajo, nombres, apellido, nombre_completo, tipo_plantel, estado`,
        [
          id,
          nombres || null,
          apellido || null,
          completo,
          legajo || null,
          input.tipoPlantel ?? null,
        ],
      );
      if (input.posicionId && input.fechaDesde) {
        await this.assignPosition({
          inspectorId: id,
          posicionId: input.posicionId,
          fechaDesde: input.fechaDesde,
          motivo: 'Cambio de secuencia / posición',
          userId: input.userId,
        });
      }
      return result.rows[0];
    } catch (e) {
      if (isPgError(e) && e.code === '23505') {
        throw new ConflictException('Ya existe alguien con ese legajo');
      }
      throw e;
    }
  }

  async deactivateInspector(id: string, fechaBaja?: string) {
    const current = await this.db.query(
      `SELECT id FROM seguridad_vial.inspector WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Inspector no encontrado');
    const baja = fechaBaja ?? new Date().toISOString().slice(0, 10);
    await this.db.query(
      `UPDATE seguridad_vial.asignacion_inspector_posicion
       SET fecha_hasta = least(coalesce(fecha_hasta, $2::date), $2::date)
       WHERE inspector_id = $1 AND $2::date <@ vigencia`,
      [id, baja],
    );
    const result = await this.db.query(
      `UPDATE seguridad_vial.inspector
       SET estado = 'INACTIVO',
           fecha_baja = $2::date,
           actualizado_en = now()
       WHERE id = $1
       RETURNING id, legajo, nombres, apellido, nombre_completo, tipo_plantel, estado,
                 fecha_baja::text AS fecha_baja`,
      [id, baja],
    );
    return result.rows[0];
  }

  async assignablePositions() {
    const result = await this.db.query(
      `SELECT p.id,
              p.codigo,
              p.tipo,
              pr.nombre AS perfil,
              (
                SELECT coalesce(string_agg(pt.turno::text, '→' ORDER BY pt.orden), '—')
                FROM seguridad_vial.perfil_rotacion_turno pt WHERE pt.perfil_id = pr.id
              ) AS turnos,
              (
                SELECT coalesce(string_agg(m.numero::text, '→' ORDER BY pm.orden), '—')
                FROM seguridad_vial.perfil_rotacion_movil pm
                JOIN seguridad_vial.movil m ON m.id = pm.movil_id
                WHERE pm.perfil_id = pr.id
              ) AS moviles,
              i.id AS ocupante_id,
              i.nombre_completo AS ocupante,
              a.fecha_desde::text AS ocupante_desde
       FROM seguridad_vial.posicion_cuadratura p
       JOIN seguridad_vial.perfil_rotacion pr ON pr.id = p.perfil_rotacion_id
       LEFT JOIN LATERAL (
         SELECT a1.inspector_id, a1.fecha_desde
         FROM seguridad_vial.asignacion_inspector_posicion a1
         WHERE a1.posicion_id = p.id AND current_date <@ a1.vigencia
         ORDER BY a1.fecha_desde DESC LIMIT 1
       ) a ON true
       LEFT JOIN seguridad_vial.inspector i ON i.id = a.inspector_id
       WHERE p.estado = 'ACTIVO'
       ORDER BY i.nombre_completo NULLS FIRST, p.codigo`,
    );
    return result.rows;
  }

  private async assignPosition(input: {
    inspectorId: string;
    posicionId: string;
    fechaDesde: string;
    motivo: string;
    userId?: string;
  }) {
    const pos = await this.db.query(
      `SELECT id FROM seguridad_vial.posicion_cuadratura
       WHERE id = $1 AND estado = 'ACTIVO'`,
      [input.posicionId],
    );
    if (!pos.rows[0]) {
      throw new BadRequestException('Esa posición no existe o está inactiva');
    }

    await this.db.withClient(async (client) => {
      await client.query(
        `DELETE FROM seguridad_vial.asignacion_inspector_posicion
         WHERE (posicion_id = $1 OR inspector_id = $2)
           AND fecha_desde >= $3::date
           AND $3::date <@ vigencia`,
        [input.posicionId, input.inspectorId, input.fechaDesde],
      );
      await client.query(
        `UPDATE seguridad_vial.asignacion_inspector_posicion
         SET fecha_hasta = $3::date - 1
         WHERE (posicion_id = $1 OR inspector_id = $2)
           AND $3::date <@ vigencia
           AND fecha_desde < $3::date`,
        [input.posicionId, input.inspectorId, input.fechaDesde],
      );
      await client.query(
        `INSERT INTO seguridad_vial.asignacion_inspector_posicion (
           posicion_id, inspector_id, fecha_desde, motivo, aprobado_por
         ) VALUES ($1, $2, $3::date, $4, $5)`,
        [
          input.posicionId,
          input.inspectorId,
          input.fechaDesde,
          input.motivo,
          input.userId ?? null,
        ],
      );
    });
  }

  async listLicencias() {
    const result = await this.db.query(
      `SELECT id, codigo, nombre, activo, orden, color_fondo, color_letra
       FROM seguridad_vial.catalogo_licencia
       ORDER BY orden, nombre`,
    );
    return result.rows;
  }

  async createLicencia(input: {
    nombre: string;
    codigo?: string;
    color_fondo?: string | null;
    color_letra?: string | null;
  }) {
    const nombre = input.nombre.trim();
    if (!nombre) {
      throw new BadRequestException('El nombre de la licencia es obligatorio');
    }
    const codigo = input.codigo?.trim() || slugCodigo(nombre);
    if (!codigo) {
      throw new BadRequestException('No se pudo armar un código para esa licencia');
    }
    const colorFondo = colorHex(input.color_fondo);
    const colorLetra = colorHex(input.color_letra);
    const maxOrden = await this.db.query<{ n: number }>(
      `SELECT coalesce(max(orden), 0)::int AS n FROM seguridad_vial.catalogo_licencia`,
    );
    try {
      const result = await this.db.query(
        `INSERT INTO seguridad_vial.catalogo_licencia
           (codigo, nombre, orden, color_fondo, color_letra)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, codigo, nombre, activo, orden, color_fondo, color_letra`,
        [codigo, nombre, (maxOrden.rows[0]?.n ?? 0) + 10, colorFondo, colorLetra],
      );
      return result.rows[0];
    } catch (e) {
      if (isPgError(e) && e.code === '23505') {
        throw new ConflictException('Ya existe una licencia con ese código');
      }
      throw e;
    }
  }

  async updateLicencia(
    id: string,
    input: {
      nombre?: string;
      codigo?: string;
      activo?: boolean;
      orden?: number;
      color_fondo?: string | null;
      color_letra?: string | null;
    },
  ) {
    const current = await this.db.query(
      `SELECT id FROM seguridad_vial.catalogo_licencia WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) {
      throw new NotFoundException('Licencia no encontrada');
    }
    const touchFondo = Object.prototype.hasOwnProperty.call(input, 'color_fondo');
    const touchLetra = Object.prototype.hasOwnProperty.call(input, 'color_letra');
    const result = await this.db.query(
      `UPDATE seguridad_vial.catalogo_licencia
       SET nombre = coalesce($2, nombre),
           codigo = coalesce($3, codigo),
           activo = coalesce($4, activo),
           orden = coalesce($5, orden),
           color_fondo = CASE WHEN $6::boolean THEN $7 ELSE color_fondo END,
           color_letra = CASE WHEN $8::boolean THEN $9 ELSE color_letra END
       WHERE id = $1
       RETURNING id, codigo, nombre, activo, orden, color_fondo, color_letra`,
      [
        id,
        input.nombre?.trim() || null,
        input.codigo?.trim()?.toUpperCase() || null,
        input.activo ?? null,
        input.orden ?? null,
        touchFondo,
        touchFondo ? colorHex(input.color_fondo) : null,
        touchLetra,
        touchLetra ? colorHex(input.color_letra) : null,
      ],
    );
    return result.rows[0];
  }

  async deleteLicencia(id: string) {
    const current = await this.db.query(
      `SELECT id FROM seguridad_vial.catalogo_licencia WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Licencia no encontrada');
    const used = await this.db.query(
      `SELECT 1 FROM seguridad_vial.asignacion_operativa
       WHERE catalogo_licencia_id = $1 LIMIT 1`,
      [id],
    );
    if (used.rows[0]) {
      throw new ConflictException(
        'Esa licencia ya se usó en la real. Desactivala en lugar de eliminarla.',
      );
    }
    await this.db.query(
      `DELETE FROM seguridad_vial.catalogo_licencia WHERE id = $1`,
      [id],
    );
    return { ok: true };
  }
}


