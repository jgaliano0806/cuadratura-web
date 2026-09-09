import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  ROLE_CODES,
  PERMISSION_CODES,
  defaultsDeTipo,
  tipoPrincipal,
  veSeccion,
  type AlcanceSecciones,
  type PermissionCode,
  type RoleCode,
} from '@plataforma/shared';
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

function exigirSeccion(alcance: AlcanceSecciones, seccion?: string | null) {
  if (!veSeccion(alcance, seccion)) {
    throw new ForbiddenException('No podés operar esa sección');
  }
}

function claveTemporal(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return [...randomBytes(10)].map((b) => chars[b % chars.length]).join('');
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

  async inspectors(alcance: AlcanceSecciones) {
    const result = await this.db.query(
      `SELECT i.id,
              i.legajo,
              i.nombres,
              i.apellido,
              i.nombre_completo,
              i.tipo_plantel,
              i.seccion,
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
       WHERE ($1::boolean OR coalesce(i.seccion, 'MOVILES') = ANY($2::varchar[]))
       ORDER BY coalesce(i.apellido, i.nombre_completo), coalesce(i.nombres, ''), i.legajo`,
      [alcance.seccionesTodas, alcance.secciones],
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
    const result = await this.db.query<{
      id: string;
      legajo: string | null;
      apellido: string | null;
      nombres: string | null;
      nombre_mostrar: string;
      nombre_usuario: string;
      email: string | null;
      estado: string;
      secciones_todas: boolean;
      roles: string[] | null;
      roles_texto: string;
      permisos: string[] | null;
      secciones: string[] | null;
    }>(
      `SELECT u.id,
              u.legajo,
              u.apellido,
              u.nombres,
              u.nombre_mostrar,
              u.nombre_usuario,
              u.email,
              u.estado,
              u.secciones_todas,
              coalesce(
                array_agg(DISTINCT r.codigo) FILTER (WHERE r.codigo IS NOT NULL),
                '{}'
              ) AS roles,
              coalesce(
                string_agg(DISTINCT r.nombre, ' · ' ORDER BY r.nombre),
                '—'
              ) AS roles_texto,
              coalesce(
                (
                  SELECT array_agg(p.codigo ORDER BY p.codigo)
                  FROM seguridad_vial.usuario_permiso up
                  JOIN seguridad_vial.permiso p ON p.id = up.permiso_id
                  WHERE up.usuario_id = u.id
                ),
                '{}'
              ) AS permisos,
              coalesce(
                (
                  SELECT array_agg(s.seccion ORDER BY s.seccion)
                  FROM seguridad_vial.usuario_seccion s
                  WHERE s.usuario_id = u.id
                ),
                '{}'
              ) AS secciones
       FROM seguridad_vial.usuario u
       LEFT JOIN seguridad_vial.usuario_rol ur
         ON ur.usuario_id = u.id
        AND (ur.fecha_hasta IS NULL OR ur.fecha_hasta >= current_date)
       LEFT JOIN seguridad_vial.rol r ON r.id = ur.rol_id
       GROUP BY u.id
       ORDER BY coalesce(u.apellido, u.nombre_mostrar), coalesce(u.nombres, ''), u.nombre_usuario`,
    );
    return result.rows.map((row) => ({
      ...row,
      roles: row.roles ?? [],
      permisos: row.permisos ?? [],
      secciones: row.secciones ?? [],
    }));
  }

  async listRoles() {
    const result = await this.db.query<{
      codigo: string;
      nombre: string;
      descripcion: string | null;
      permisos: string[] | null;
    }>(
      `SELECT r.codigo,
              r.nombre,
              r.descripcion,
              coalesce(
                array_agg(p.codigo) FILTER (WHERE p.codigo IS NOT NULL),
                '{}'
              ) AS permisos
       FROM seguridad_vial.rol r
       LEFT JOIN seguridad_vial.rol_permiso rp ON rp.rol_id = r.id
       LEFT JOIN seguridad_vial.permiso p ON p.id = rp.permiso_id
       WHERE r.codigo IN (
         'ADMINISTRADOR_SISTEMA',
         'JEFE_SECTOR',
         'RECURSOS_HUMANOS',
         'AUDITOR',
         'CONSULTA'
       )
       GROUP BY r.id
       ORDER BY CASE r.codigo
         WHEN 'ADMINISTRADOR_SISTEMA' THEN 1
         WHEN 'JEFE_SECTOR' THEN 2
         WHEN 'RECURSOS_HUMANOS' THEN 3
         WHEN 'AUDITOR' THEN 4
         WHEN 'CONSULTA' THEN 5
         ELSE 9
       END, r.nombre`,
    );
    return result.rows.map((row) => ({
      ...row,
      permisos: row.permisos?.length ? row.permisos : defaultsDeTipo(row.codigo),
    }));
  }

  async createUser(input: {
    nombreUsuario?: string;
    apellido: string;
    nombres: string;
    email?: string;
    legajo?: string;
    roles: string[];
    permisos?: string[];
    secciones?: string[];
    seccionesTodas?: boolean;
    estado?: 'ACTIVO' | 'INACTIVO';
  }) {
    const email = this.emailOpcional(input.email);
    const username = (input.nombreUsuario?.trim() || email || '').trim();
    const apellido = input.apellido.trim();
    const nombres = input.nombres.trim();
    if (!email) {
      throw new BadRequestException('El email es obligatorio: con eso se ingresa');
    }
    if (!username || !apellido || !nombres) {
      throw new BadRequestException('Apellido y nombre son obligatorios');
    }
    const password = claveTemporal();
    const roles = this.rolesValidos(input.roles);
    const permisos = this.permisosEfectivos(roles, input.permisos);
    const hash = await bcrypt.hash(password, 10);
    const mostrar = nombreCompleto(apellido, nombres);
    try {
      return await this.db.withClient(async (c) => {
        const created = await c.query<{ id: string }>(
          `INSERT INTO usuario (
             nombre_usuario, nombre_mostrar, email, hash_clave, estado,
             legajo, apellido, nombres, secciones_todas
           ) VALUES ($1, $2, $3, $4, $5::estado_registro, $6, $7, $8, $9)
           RETURNING id`,
          [
            username,
            mostrar,
            email,
            hash,
            input.estado === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO',
            this.textoOpcional(input.legajo),
            apellido,
            nombres,
            Boolean(input.seccionesTodas),
          ],
        );
        const id = created.rows[0].id;
        await this.escribirRoles(c, id, roles);
        await this.escribirPermisos(c, id, permisos);
        await this.escribirSecciones(c, id, Boolean(input.seccionesTodas), input.secciones);
        return { id, clave: password };
      });
    } catch (e) {
      this.lanzarConflictoUsuario(e);
      throw e;
    }
  }

  async updateUser(
    id: string,
    input: {
      nombreUsuario?: string;
      apellido?: string;
      nombres?: string;
      email?: string | null;
      legajo?: string | null;
      roles?: string[];
      permisos?: string[];
      secciones?: string[];
      seccionesTodas?: boolean;
      estado?: 'ACTIVO' | 'INACTIVO';
    },
  ) {
    const current = await this.db.query<{ id: string }>(
      `SELECT id FROM seguridad_vial.usuario WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Usuario no encontrado');
    const roles = input.roles ? this.rolesValidos(input.roles) : null;
    try {
      await this.db.withClient(async (c) => {
        await c.query(
          `UPDATE usuario
           SET nombre_usuario = coalesce($2, nombre_usuario),
               apellido = coalesce($3, apellido),
               nombres = coalesce($4, nombres),
               nombre_mostrar = CASE
                 WHEN $3 IS NOT NULL OR $4 IS NOT NULL THEN
                   trim(both ' ' FROM coalesce($3, apellido) || ', ' || coalesce($4, nombres))
                 ELSE nombre_mostrar
               END,
               email = CASE WHEN $5::boolean THEN $6 ELSE email END,
               legajo = CASE WHEN $7::boolean THEN $8 ELSE legajo END,
               estado = coalesce($9::estado_registro, estado),
               secciones_todas = coalesce($10, secciones_todas),
               actualizado_en = now()
           WHERE id = $1`,
          [
            id,
            input.nombreUsuario?.trim() || null,
            input.apellido?.trim() || null,
            input.nombres?.trim() || null,
            input.email !== undefined,
            input.email === undefined ? null : this.emailOpcional(input.email),
            input.legajo !== undefined,
            input.legajo === undefined ? null : this.textoOpcional(input.legajo),
            input.estado ?? null,
            input.seccionesTodas ?? null,
          ],
        );
        if (roles) await this.escribirRoles(c, id, roles);
        if (input.permisos) {
          await this.escribirPermisos(c, id, this.permisosValidos(input.permisos));
        } else if (roles) {
          await this.escribirPermisos(c, id, this.permisosEfectivos(roles));
        }
        if (input.seccionesTodas !== undefined || input.secciones) {
          await this.escribirSecciones(c, id, Boolean(input.seccionesTodas), input.secciones);
        }
      });
    } catch (e) {
      this.lanzarConflictoUsuario(e);
      throw e;
    }
    return { ok: true };
  }

  async resetUserPassword(id: string) {
    const current = await this.db.query<{ id: string }>(
      `SELECT id FROM seguridad_vial.usuario WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Usuario no encontrado');
    const password = claveTemporal();
    const hash = await bcrypt.hash(password, 10);
    await this.db.query(
      `UPDATE seguridad_vial.usuario
       SET hash_clave = $2, actualizado_en = now()
       WHERE id = $1`,
      [id, hash],
    );
    return { clave: password };
  }

  async deleteUser(id: string, actorId: string) {
    if (id === actorId) {
      throw new ForbiddenException('No podés borrar tu propio usuario');
    }
    const current = await this.db.query<{ id: string }>(
      `SELECT id FROM seguridad_vial.usuario WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Usuario no encontrado');
    const usado = await this.db.query(
      `SELECT 1 WHERE EXISTS (
         SELECT 1 FROM seguridad_vial.timer_guardado WHERE guardado_por = $1
         UNION ALL
         SELECT 1 FROM seguridad_vial.timer_extra WHERE creado_por = $1
       )`,
      [id],
    );
    if (usado.rows[0]) {
      throw new ConflictException(
        'Ese usuario ya firmó un Timer. Ponelo Inactivo en Modificar.',
      );
    }
    try {
      await this.db.withClient(async (c) => {
        await c.query(`DELETE FROM usuario_rol WHERE usuario_id = $1`, [id]);
        await c.query(`DELETE FROM usuario_seccion WHERE usuario_id = $1`, [id]);
        await c.query(`DELETE FROM usuario WHERE id = $1`, [id]);
      });
    } catch (e) {
      if (isPgError(e) && e.code === '23503') {
        throw new ConflictException(
          'Ese usuario tiene movimientos en el sistema. Desactivalo en lugar de borrarlo.',
        );
      }
      throw e;
    }
    return { ok: true };
  }

  private permisosValidos(permisos: string[]): PermissionCode[] {
    const allowed = new Set<string>(Object.values(PERMISSION_CODES));
    const out = [...new Set(permisos.map((p) => p.trim()).filter(Boolean))];
    if (!out.length) throw new BadRequestException('Asigná al menos un permiso');
    for (const p of out) {
      if (!allowed.has(p)) throw new BadRequestException(`Permiso no válido: ${p}`);
    }
    return out as PermissionCode[];
  }

  private permisosEfectivos(roles: string[], permisos?: string[]): PermissionCode[] {
    if (permisos?.length) return this.permisosValidos(permisos);
    return defaultsDeTipo(tipoPrincipal(roles));
  }

  private async escribirPermisos(
    c: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    userId: string,
    permisos: string[],
  ) {
    await c.query(`DELETE FROM usuario_permiso WHERE usuario_id = $1`, [userId]);
    await c.query(
      `INSERT INTO usuario_permiso (usuario_id, permiso_id)
       SELECT $1, p.id
       FROM permiso p
       WHERE p.codigo = ANY($2::varchar[])`,
      [userId, permisos],
    );
  }

  private rolesValidos(roles: string[]): RoleCode[] {
    const allowed = new Set<string>(Object.values(ROLE_CODES));
    const out = [...new Set(roles.map((r) => r.trim()).filter(Boolean))];
    if (!out.length) throw new BadRequestException('Asigná al menos un rol');
    for (const r of out) {
      if (!allowed.has(r)) throw new BadRequestException(`Rol no válido: ${r}`);
    }
    return out as RoleCode[];
  }

  private emailOpcional(value?: string | null): string | null {
    const t = value?.trim() ?? '';
    return t || null;
  }

  private textoOpcional(value?: string | null): string | null {
    const t = value?.trim() ?? '';
    return t || null;
  }

  private async escribirRoles(
    c: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    userId: string,
    roles: string[],
  ) {
    await c.query(`DELETE FROM usuario_rol WHERE usuario_id = $1`, [userId]);
    await c.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id, fecha_desde)
       SELECT $1, r.id, current_date
       FROM rol r
       WHERE r.codigo = ANY($2::varchar[])`,
      [userId, roles],
    );
  }

  private async escribirSecciones(
    c: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    userId: string,
    todas: boolean,
    secciones?: string[],
  ) {
    await c.query(`DELETE FROM usuario_seccion WHERE usuario_id = $1`, [userId]);
    if (todas) return;
    const lista = [...new Set((secciones ?? []).map((s) => s.trim()).filter(Boolean))];
    if (!lista.length) return;
    await c.query(
      `INSERT INTO usuario_seccion (usuario_id, seccion)
       SELECT $1, x FROM unnest($2::varchar[]) AS x`,
      [userId, lista],
    );
  }

  private lanzarConflictoUsuario(e: unknown): void {
    if (!isPgError(e)) return;
    if (e.code === '23505') {
      throw new ConflictException('Ya existe un usuario con ese nombre, email o legajo');
    }
    if (e.code === '23514') {
      throw new BadRequestException('Sección no válida');
    }
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
    seccion?: string;
    userId?: string;
    alcance: AlcanceSecciones;
  }) {
    const nombres = input.nombres.trim();
    const apellido = input.apellido.trim();
    const legajo = input.legajo.trim();
    if (!nombres || !apellido || !legajo) {
      throw new BadRequestException('Nombre, apellido y legajo son obligatorios');
    }
    const plantel = input.tipoPlantel ?? 'TITULAR';
    const seccion = input.seccion ?? 'MOVILES';
    exigirSeccion(input.alcance, seccion);
    const fechaAlta = input.fechaDesde ?? null;
    try {
      const result = await this.db.query(
        `INSERT INTO seguridad_vial.inspector (
           legajo, nombres, apellido, nombre_completo, tipo_plantel, seccion, fecha_alta
         ) VALUES (
           $1, $2, $3, $4, $5::seguridad_vial.tipo_plantel, $7,
           coalesce($6::date, current_date)
         )
         RETURNING id, legajo, nombres, apellido, nombre_completo, tipo_plantel, seccion, estado,
                   fecha_alta::text AS fecha_alta`,
        [legajo, nombres, apellido, nombreCompleto(apellido, nombres), plantel, fechaAlta, seccion],
      );
      const created = result.rows[0];
      const desde = fechaAlta ?? new Date().toISOString().slice(0, 10);
      await this.abrirSeccion(created.id, seccion, desde, 'Alta de inspector');
      if (input.posicionId) {
        await this.assignPosition({
          inspectorId: created.id,
          posicionId: input.posicionId,
          fechaDesde: desde,
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
      seccion?: string;
      userId?: string;
      alcance: AlcanceSecciones;
    },
  ) {
    const current = await this.db.query<{
      id: string;
      nombres: string | null;
      apellido: string | null;
      seccion: string | null;
    }>(
      `SELECT id, nombres, apellido, seccion FROM seguridad_vial.inspector WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Inspector no encontrado');
    exigirSeccion(input.alcance, current.rows[0].seccion);
    if (input.seccion) exigirSeccion(input.alcance, input.seccion);

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
             seccion = coalesce($7, seccion),
             actualizado_en = now()
         WHERE id = $1
         RETURNING id, legajo, nombres, apellido, nombre_completo, tipo_plantel, seccion, estado`,
        [
          id,
          nombres || null,
          apellido || null,
          completo,
          legajo || null,
          input.tipoPlantel ?? null,
          input.seccion ?? null,
        ],
      );
      const desde = input.fechaDesde ?? new Date().toISOString().slice(0, 10);
      if (input.seccion && input.seccion !== (current.rows[0].seccion || 'MOVILES')) {
        await this.abrirSeccion(id, input.seccion, desde, 'Cambio de sección');
        if (input.seccion !== 'MOVILES') {
          await this.cerrarPosicionVigente(id, desde);
        }
      }
      const seccionFinal = input.seccion ?? current.rows[0].seccion ?? 'MOVILES';
      if (input.posicionId && input.fechaDesde && seccionFinal === 'MOVILES') {
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

  async deactivateInspector(id: string, alcance: AlcanceSecciones, fechaBaja?: string) {
    const current = await this.db.query<{ id: string; seccion: string | null }>(
      `SELECT id, seccion FROM seguridad_vial.inspector WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Inspector no encontrado');
    exigirSeccion(alcance, current.rows[0].seccion);
    const baja = fechaBaja ?? new Date().toISOString().slice(0, 10);
    await this.cerrarPosicionVigente(id, baja);
    await this.db.query(
      `UPDATE seguridad_vial.inspector_seccion_periodo
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
              pr.id AS perfil_id,
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

  async createPosition(input: {
    tipo?: 'GENERAL' | 'MOVIL4' | 'MOVIL6' | 'MOVIL7';
    perfilId?: string;
    fechaDesde?: string;
    moviles?: number[];
    turnos?: Array<'M' | 'N' | 'T'>;
  }) {
    const spec: Record<
      'GENERAL' | 'MOVIL4' | 'MOVIL6' | 'MOVIL7',
      { re: RegExp; perfil: string; etiqueta: string; codigo: (n: string) => string }
    > = {
      GENERAL: {
        re: /^GEN-(\d+)$/i,
        perfil: 'ROTACION_GENERAL',
        etiqueta: 'Rotación',
        codigo: (n) => `GEN-${n}`,
      },
      MOVIL4: {
        re: /^M4-P(\d+)$/i,
        perfil: 'MOVIL4_FIJO',
        etiqueta: 'Móvil 4',
        codigo: (n) => `M4-P${n}`,
      },
      MOVIL6: {
        re: /^M6-P(\d+)$/i,
        perfil: 'MOVIL6_FIJO',
        etiqueta: 'Móvil 6',
        codigo: (n) => `M6-P${n}`,
      },
      MOVIL7: {
        re: /^M7-P(\d+)$/i,
        perfil: 'MOVIL7_FIJO',
        etiqueta: 'Móvil 7',
        codigo: (n) => `M7-P${n}`,
      },
    };
    const desde = input.fechaDesde?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const nums = (input.moviles ?? []).filter((n) => Number.isInteger(n) && n > 0);
    const turnosIn = (input.turnos ?? []).filter(
      (t): t is 'M' | 'N' | 'T' => t === 'M' || t === 'N' || t === 'T',
    );

    let tipo = input.tipo;
    let perfilId = input.perfilId ?? '';

    if (nums.length && turnosIn.length) {
      const hallado = await this.db.query<{ id: string }>(
        `SELECT pr.id
         FROM seguridad_vial.perfil_rotacion pr
         WHERE pr.estado = 'ACTIVO'
           AND (
             SELECT coalesce(string_agg(pt.turno::text, ',' ORDER BY pt.orden), '')
             FROM seguridad_vial.perfil_rotacion_turno pt WHERE pt.perfil_id = pr.id
           ) = $1
           AND (
             SELECT coalesce(string_agg(m.numero::text, ',' ORDER BY pm.orden), '')
             FROM seguridad_vial.perfil_rotacion_movil pm
             JOIN seguridad_vial.movil m ON m.id = pm.movil_id
             WHERE pm.perfil_id = pr.id
           ) = $2
         LIMIT 1`,
        [turnosIn.join(','), nums.join(',')],
      );
      if (hallado.rows[0]) {
        perfilId = hallado.rows[0].id;
      } else {
        const movilRows = await this.db.query<{ id: string; numero: number }>(
          `SELECT id, numero FROM seguridad_vial.movil
           WHERE numero = ANY($1::int[]) AND estado = 'ACTIVO'`,
          [nums],
        );
        const byNum = new Map(movilRows.rows.map((m) => [m.numero, m.id]));
        const missing = nums.filter((n) => !byNum.has(n));
        if (missing.length) {
          throw new BadRequestException(`No están esos móviles: ${missing.join(', ')}`);
        }
        const tipoCfg = nums.length === 1 ? 'FIJO_MOVIL' : 'GENERAL';
        const baseCodigo = `ROT_${nums.join('_')}_${turnosIn.join('')}`;
        const createdPerfil = await this.db.withClient(async (client) => {
          let codigo = baseCodigo;
          for (let i = 0; i < 20; i += 1) {
            const dup = await client.query(
              `SELECT 1 FROM seguridad_vial.perfil_rotacion WHERE codigo = $1`,
              [codigo],
            );
            if (!dup.rows[0]) break;
            codigo = `${baseCodigo}_${i + 2}`;
          }
          const ins = await client.query<{ id: string }>(
            `INSERT INTO seguridad_vial.perfil_rotacion (
               codigo, nombre, tipo, vigencia_desde, estado
             ) VALUES ($1, $2, $3::seguridad_vial.tipo_configuracion, $4::date, 'ACTIVO')
             RETURNING id`,
            [
              codigo,
              `Rotación ${nums.join('→')} / ${turnosIn.join('→')}`,
              tipoCfg,
              desde,
            ],
          );
          const id = ins.rows[0].id;
          for (let i = 0; i < turnosIn.length; i += 1) {
            await client.query(
              `INSERT INTO seguridad_vial.perfil_rotacion_turno (perfil_id, orden, turno)
               VALUES ($1, $2, $3::seguridad_vial.turno_codigo)`,
              [id, i + 1, turnosIn[i]],
            );
          }
          for (let i = 0; i < nums.length; i += 1) {
            await client.query(
              `INSERT INTO seguridad_vial.perfil_rotacion_movil (perfil_id, orden, movil_id)
               VALUES ($1, $2, $3::uuid)`,
              [id, i + 1, byNum.get(nums[i])],
            );
          }
          return id;
        });
        perfilId = createdPerfil;
      }
      tipo =
        tipo ??
        (nums.length === 1 && nums[0] === 4
          ? 'MOVIL4'
          : nums.length === 1 && nums[0] === 6
            ? 'MOVIL6'
            : nums.length === 1 && nums[0] === 7
              ? 'MOVIL7'
              : 'GENERAL');
    }

    if (!perfilId && tipo) {
      const plantilla = await this.db.query<{ perfil_rotacion_id: string }>(
        `SELECT perfil_rotacion_id
         FROM seguridad_vial.posicion_cuadratura
         WHERE tipo = $1::seguridad_vial.tipo_posicion AND estado = 'ACTIVO'
         ORDER BY codigo
         LIMIT 1`,
        [tipo],
      );
      if (plantilla.rows[0]) {
        perfilId = plantilla.rows[0].perfil_rotacion_id;
      } else {
        const perfil = await this.db.query<{ id: string }>(
          `SELECT id FROM seguridad_vial.perfil_rotacion
           WHERE codigo = $1 AND estado = 'ACTIVO'`,
          [spec[tipo].perfil],
        );
        if (!perfil.rows[0]) {
          throw new BadRequestException(`No hay perfil para ${spec[tipo].etiqueta}`);
        }
        perfilId = perfil.rows[0].id;
      }
    }

    if (!perfilId) {
      throw new BadRequestException('Indicá la secuencia (perfil) o el ciclo de móviles y turnos');
    }

    if (!tipo) {
      const dePerfil = await this.db.query<{ tipo: string; n: number }>(
        `SELECT p.tipo::text AS tipo, count(*)::int AS n
         FROM seguridad_vial.posicion_cuadratura p
         WHERE p.perfil_rotacion_id = $1
         GROUP BY p.tipo
         ORDER BY n DESC
         LIMIT 1`,
        [perfilId],
      );
      const t = dePerfil.rows[0]?.tipo;
      tipo =
        t === 'MOVIL4' || t === 'MOVIL6' || t === 'MOVIL7' || t === 'GENERAL'
          ? t
          : 'GENERAL';
    }

    const head = await this.db.query<{
      turno: string | null;
      movil_id: string | null;
    }>(
      `SELECT (SELECT pt.turno::text FROM seguridad_vial.perfil_rotacion_turno pt
                WHERE pt.perfil_id = $1 ORDER BY pt.orden LIMIT 1) AS turno,
              (SELECT pm.movil_id::text FROM seguridad_vial.perfil_rotacion_movil pm
                WHERE pm.perfil_id = $1 ORDER BY pm.orden LIMIT 1) AS movil_id`,
      [perfilId],
    );
    const turno = head.rows[0]?.turno ?? null;
    const movilId = head.rows[0]?.movil_id ?? null;
    const cfg = spec[tipo];

    const existentes = await this.db.query<{ codigo: string }>(
      `SELECT codigo FROM seguridad_vial.posicion_cuadratura
       WHERE tipo = $1::seguridad_vial.tipo_posicion`,
      [tipo],
    );
    let max = 0;
    let pad = 2;
    for (const row of existentes.rows) {
      const m = cfg.re.exec(row.codigo);
      if (!m) continue;
      max = Math.max(max, Number(m[1]));
      pad = Math.max(pad, m[1].length);
    }
    const codigo = cfg.codigo(String(max + 1).padStart(pad, '0'));

    const created = await this.db.withClient(async (client) => {
      const gf = await client.query<{ id: string }>(
        `INSERT INTO seguridad_vial.grupo_franco (
           codigo, nombre, fecha_ancla, posicion_inicial_ciclo, origen_ancla
         ) VALUES ($1, $2, $3::date, 0, 'CONFIGURACION')
         RETURNING id`,
        [`GF-${codigo}`, `Grupo ${codigo}`, desde],
      );
      const pos = await client.query<{ id: string }>(
        `INSERT INTO seguridad_vial.posicion_cuadratura (
           codigo, nombre, tipo, grupo_franco_id, perfil_rotacion_id,
           fecha_ancla, posicion_inicial_ciclo, turno_inicial, movil_inicial_id,
           desfase_dias_referencia, origen_ancla, vigencia_desde
         ) VALUES (
           $1, $2, $3::seguridad_vial.tipo_posicion, $4, $5,
           $6::date, 0, $7::seguridad_vial.turno_codigo, $8::uuid,
           0, 'CONFIGURACION', $6::date
         )
         RETURNING id`,
        [
          codigo,
          `${cfg.etiqueta} ${codigo}`,
          tipo,
          gf.rows[0].id,
          perfilId,
          desde,
          turno,
          movilId,
        ],
      );
      return pos.rows[0].id;
    });

    const row = await this.db.query(
      `SELECT p.id,
              p.codigo,
              p.tipo,
              pr.id AS perfil_id,
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
              NULL::uuid AS ocupante_id,
              NULL::text AS ocupante
       FROM seguridad_vial.posicion_cuadratura p
       JOIN seguridad_vial.perfil_rotacion pr ON pr.id = p.perfil_rotacion_id
       WHERE p.id = $1`,
      [created],
    );
    return row.rows[0];
  }

  async historialInspector(id: string, alcance: AlcanceSecciones) {
    const head = await this.db.query(
      `SELECT id, legajo, nombres, apellido, nombre_completo, seccion, estado
       FROM seguridad_vial.inspector WHERE id = $1`,
      [id],
    );
    if (!head.rows[0]) throw new NotFoundException('Inspector no encontrado');
    exigirSeccion(alcance, head.rows[0].seccion);
    const filas = await this.db.query<{
      origen: string;
      seccion: string;
      fecha_desde: string;
      fecha_hasta: string | null;
      posicion_codigo: string | null;
      posicion_etiqueta: string | null;
      motivo: string;
    }>(
      `SELECT 'secuencia' AS origen,
              'MOVILES' AS seccion,
              a.fecha_desde::text AS fecha_desde,
              a.fecha_hasta::text AS fecha_hasta,
              p.codigo AS posicion_codigo,
              CASE
                WHEN p.tipo = 'MOVIL4' THEN 'Móvil 4 · ' || p.codigo
                WHEN p.tipo = 'MOVIL6' THEN 'Ruta 36 · Móvil 6 · ' || p.codigo
                WHEN p.tipo = 'MOVIL7' THEN 'Ruta 36 · Móvil 7 · ' || p.codigo
                ELSE 'Rotación · ' || p.codigo
              END AS posicion_etiqueta,
              a.motivo
       FROM seguridad_vial.asignacion_inspector_posicion a
       JOIN seguridad_vial.posicion_cuadratura p ON p.id = a.posicion_id
       WHERE a.inspector_id = $1
       UNION ALL
       SELECT 'seccion' AS origen,
              s.seccion,
              s.fecha_desde::text,
              s.fecha_hasta::text,
              NULL,
              NULL,
              s.motivo
       FROM seguridad_vial.inspector_seccion_periodo s
       WHERE s.inspector_id = $1
         AND s.seccion <> 'MOVILES'
       ORDER BY 3 DESC, 4 DESC NULLS FIRST`,
      [id],
    );
    return { inspector: head.rows[0], filas: filas.rows };
  }

  private async abrirSeccion(
    inspectorId: string,
    seccion: string,
    fechaDesde: string,
    motivo: string,
  ) {
    await this.db.query(
      `DELETE FROM seguridad_vial.inspector_seccion_periodo
       WHERE inspector_id = $1
         AND fecha_desde >= $2::date
         AND $2::date <@ vigencia`,
      [inspectorId, fechaDesde],
    );
    await this.db.query(
      `UPDATE seguridad_vial.inspector_seccion_periodo
       SET fecha_hasta = $2::date - 1
       WHERE inspector_id = $1
         AND $2::date <@ vigencia
         AND fecha_desde < $2::date`,
      [inspectorId, fechaDesde],
    );
    await this.db.query(
      `INSERT INTO seguridad_vial.inspector_seccion_periodo (
         inspector_id, seccion, fecha_desde, motivo
       ) VALUES ($1, $2, $3::date, $4)`,
      [inspectorId, seccion, fechaDesde, motivo],
    );
  }

  private async cerrarPosicionVigente(inspectorId: string, fecha: string) {
    await this.db.query(
      `UPDATE seguridad_vial.asignacion_inspector_posicion
       SET fecha_hasta = least(coalesce(fecha_hasta, $2::date), $2::date)
       WHERE inspector_id = $1 AND $2::date <@ vigencia`,
      [inspectorId, fecha],
    );
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
      `SELECT id, codigo, codigo_sap, nombre, horario, ambito, tipo,
              activo, orden, color_fondo, color_letra
       FROM seguridad_vial.catalogo_licencia
       ORDER BY ambito, tipo, orden, codigo`,
    );
    return result.rows;
  }

  async createLicencia(input: {
    nombre: string;
    codigo?: string;
    codigo_sap?: string | null;
    horario?: string | null;
    ambito?: string;
    tipo?: string;
    color_fondo?: string | null;
    color_letra?: string | null;
  }) {
    const nombre = input.nombre.trim();
    if (!nombre) {
      throw new BadRequestException('La descripción del código es obligatoria');
    }
    const codigo = (input.codigo?.trim() || slugCodigo(nombre)).toUpperCase();
    if (!codigo) {
      throw new BadRequestException('No se pudo armar un código');
    }
    const ambito = input.ambito === 'BASE_OPERACIONES' ? 'BASE_OPERACIONES' : 'SEGURIDAD_VIAL';
    const tipo = ['TURNO', 'AUSENCIA', 'FRANCO', 'OTRO'].includes(input.tipo ?? '')
      ? input.tipo
      : 'AUSENCIA';
    const colorFondo = colorHex(input.color_fondo);
    const colorLetra = colorHex(input.color_letra);
    const maxOrden = await this.db.query<{ n: number }>(
      `SELECT coalesce(max(orden), 0)::int AS n
       FROM seguridad_vial.catalogo_licencia WHERE ambito = $1`,
      [ambito],
    );
    try {
      const result = await this.db.query(
        `INSERT INTO seguridad_vial.catalogo_licencia
           (codigo, codigo_sap, nombre, horario, ambito, tipo, orden, color_fondo, color_letra)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, codigo, codigo_sap, nombre, horario, ambito, tipo,
                   activo, orden, color_fondo, color_letra`,
        [
          codigo,
          input.codigo_sap?.trim() || null,
          nombre,
          input.horario?.trim() || nombre,
          ambito,
          tipo,
          (maxOrden.rows[0]?.n ?? 0) + 10,
          colorFondo,
          colorLetra,
        ],
      );
      return result.rows[0];
    } catch (e) {
      if (isPgError(e) && e.code === '23505') {
        throw new ConflictException('Ya existe ese código en el ámbito');
      }
      throw e;
    }
  }

  async updateLicencia(
    id: string,
    input: {
      nombre?: string;
      codigo?: string;
      codigo_sap?: string | null;
      horario?: string | null;
      ambito?: string;
      tipo?: string;
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
      throw new NotFoundException('Código no encontrado');
    }
    const touchFondo = Object.prototype.hasOwnProperty.call(input, 'color_fondo');
    const touchLetra = Object.prototype.hasOwnProperty.call(input, 'color_letra');
    const touchSap = Object.prototype.hasOwnProperty.call(input, 'codigo_sap');
    const result = await this.db.query(
      `UPDATE seguridad_vial.catalogo_licencia
       SET nombre = coalesce($2, nombre),
           codigo = coalesce($3, codigo),
           activo = coalesce($4, activo),
           orden = coalesce($5, orden),
           color_fondo = CASE WHEN $6::boolean THEN $7 ELSE color_fondo END,
           color_letra = CASE WHEN $8::boolean THEN $9 ELSE color_letra END,
           codigo_sap = CASE WHEN $10::boolean THEN $11 ELSE codigo_sap END,
           horario = coalesce($12, horario),
           ambito = coalesce($13, ambito),
           tipo = coalesce($14, tipo)
       WHERE id = $1
       RETURNING id, codigo, codigo_sap, nombre, horario, ambito, tipo,
                 activo, orden, color_fondo, color_letra`,
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
        touchSap,
        touchSap ? input.codigo_sap?.trim() || null : null,
        input.horario?.trim() || null,
        input.ambito === 'BASE_OPERACIONES' || input.ambito === 'SEGURIDAD_VIAL'
          ? input.ambito
          : null,
        ['TURNO', 'AUSENCIA', 'FRANCO', 'OTRO'].includes(input.tipo ?? '')
          ? input.tipo
          : null,
      ],
    );
    return result.rows[0];
  }

  async deleteLicencia(id: string) {
    const current = await this.db.query(
      `SELECT id FROM seguridad_vial.catalogo_licencia WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Código no encontrado');
    const used = await this.db.query(
      `SELECT 1 FROM seguridad_vial.asignacion_operativa
       WHERE catalogo_licencia_id = $1 LIMIT 1`,
      [id],
    );
    if (used.rows[0]) {
      throw new ConflictException(
        'Ese código ya se usó en la real. Desactivalo en lugar de eliminarlo.',
      );
    }
    await this.db.query(
      `DELETE FROM seguridad_vial.catalogo_licencia WHERE id = $1`,
      [id],
    );
    return { ok: true };
  }

  async listTimerMotivos() {
    const result = await this.db.query(
      `SELECT id, nombre, activo, orden
       FROM seguridad_vial.catalogo_timer_motivo
       ORDER BY orden, nombre`,
    );
    return result.rows;
  }

  async createTimerMotivo(input: { nombre: string; orden?: number }) {
    const nombre = input.nombre.trim();
    if (nombre.length < 3) {
      throw new BadRequestException('El motivo tiene que tener al menos 3 letras');
    }
    const maxOrden = await this.db.query<{ n: number }>(
      `SELECT coalesce(max(orden), 0)::int AS n FROM seguridad_vial.catalogo_timer_motivo`,
    );
    try {
      const result = await this.db.query(
        `INSERT INTO seguridad_vial.catalogo_timer_motivo (nombre, orden)
         VALUES ($1, $2)
         RETURNING id, nombre, activo, orden`,
        [nombre, input.orden ?? (maxOrden.rows[0]?.n ?? 0) + 10],
      );
      return result.rows[0];
    } catch (e) {
      if (isPgError(e) && e.code === '23505') {
        throw new ConflictException('Ya existe ese motivo');
      }
      throw e;
    }
  }

  async updateTimerMotivo(
    id: string,
    input: { nombre?: string; activo?: boolean; orden?: number },
  ) {
    const current = await this.db.query(
      `SELECT id FROM seguridad_vial.catalogo_timer_motivo WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Motivo no encontrado');
    const nombre = input.nombre?.trim();
    if (nombre !== undefined && nombre.length < 3) {
      throw new BadRequestException('El motivo tiene que tener al menos 3 letras');
    }
    try {
      const result = await this.db.query(
        `UPDATE seguridad_vial.catalogo_timer_motivo
         SET nombre = coalesce($2, nombre),
             activo = coalesce($3, activo),
             orden = coalesce($4, orden)
         WHERE id = $1
         RETURNING id, nombre, activo, orden`,
        [id, nombre || null, input.activo ?? null, input.orden ?? null],
      );
      return result.rows[0];
    } catch (e) {
      if (isPgError(e) && e.code === '23505') {
        throw new ConflictException('Ya existe ese motivo');
      }
      throw e;
    }
  }

  async deleteTimerMotivo(id: string) {
    const current = await this.db.query<{ nombre: string }>(
      `SELECT nombre FROM seguridad_vial.catalogo_timer_motivo WHERE id = $1`,
      [id],
    );
    const row = current.rows[0];
    if (!row) throw new NotFoundException('Motivo no encontrado');
    const used = await this.db.query(
      `SELECT 1 FROM seguridad_vial.timer_extra WHERE btrim(motivo) = btrim($1) LIMIT 1`,
      [row.nombre],
    );
    if (used.rows[0]) {
      throw new ConflictException(
        'Ese motivo ya se usó en el Timer. Desactivalo en lugar de eliminarlo.',
      );
    }
    const usedGuardado = await this.db.query(
      `SELECT 1 FROM seguridad_vial.timer_guardado_fila WHERE btrim(motivo) = btrim($1) LIMIT 1`,
      [row.nombre],
    );
    if (usedGuardado.rows[0]) {
      throw new ConflictException(
        'Ese motivo ya está en un Timer guardado. Desactivalo en lugar de eliminarlo.',
      );
    }
    await this.db.query(
      `DELETE FROM seguridad_vial.catalogo_timer_motivo WHERE id = $1`,
      [id],
    );
    return { ok: true };
  }
}


