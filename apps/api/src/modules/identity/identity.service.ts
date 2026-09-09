import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  ROLE_CODES,
  defaultsDeTipo,
  tipoPrincipal,
  type AuthUserDto,
  type PermissionCode,
  type RoleCode,
} from '@plataforma/shared';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class IdentityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(username: string, password: string, ip?: string | null) {
    const result = await this.db.query<{
      id: string;
      nombre_usuario: string;
      nombre_mostrar: string;
      hash_clave: string | null;
      estado: string;
      legajo: string | null;
      apellido: string | null;
      nombres: string | null;
    }>(
      `SELECT id, nombre_usuario, nombre_mostrar, hash_clave, estado,
              legajo, apellido, nombres
       FROM seguridad_vial.usuario
       WHERE nombre_usuario = $1
          OR lower(btrim(coalesce(email, ''))) = lower(btrim($1))
       ORDER BY CASE WHEN nombre_usuario = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [username],
    );
    const user = result.rows[0];
    if (!user || user.estado !== 'ACTIVO' || !user.hash_clave) {
      await this.audit
        .registrar({
          entidad: 'sesion',
          accion: 'LOGIN_FAIL',
          motivo: `Ingreso fallido: ${username.trim().slice(0, 80)}`,
          ip,
        })
        .catch(() => undefined);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const ok = await bcrypt.compare(password, user.hash_clave);
    if (!ok) {
      await this.audit
        .registrar({
          usuarioId: user.id,
          entidad: 'sesion',
          accion: 'LOGIN_FAIL',
          motivo: `Ingreso fallido: ${username.trim().slice(0, 80)}`,
          ip,
        })
        .catch(() => undefined);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const roles = await this.getRoles(user.id);
    const permissions = await this.getPermissions(user.id, roles);
    const alcance = await this.getAlcance(user.id);
    const dto = this.toAuthUser(user, roles, permissions, alcance);
    const accessToken = await this.jwt.signAsync({
      sub: dto.id,
      username: dto.username,
      roles: dto.roles,
    });
    void this.audit
      .registrar({
        usuarioId: user.id,
        entidad: 'sesion',
        accion: 'LOGIN',
        motivo: 'Ingresó al sistema',
        ip,
      })
      .catch(() => undefined);
    return { accessToken, user: dto };
  }

  async getRoles(userId: string): Promise<RoleCode[]> {
    const result = await this.db.query<{ codigo: string }>(
      `SELECT DISTINCT r.codigo
       FROM seguridad_vial.usuario_rol ur
       JOIN seguridad_vial.rol r ON r.id = ur.rol_id
       WHERE ur.usuario_id = $1
         AND (ur.fecha_hasta IS NULL OR ur.fecha_hasta >= current_date)`,
      [userId],
    );
    return result.rows.map((r) => r.codigo as RoleCode);
  }

  async me(userId: string): Promise<AuthUserDto> {
    const result = await this.db.query<{
      id: string;
      nombre_usuario: string;
      nombre_mostrar: string;
      legajo: string | null;
      apellido: string | null;
      nombres: string | null;
    }>(
      `SELECT id, nombre_usuario, nombre_mostrar, legajo, apellido, nombres
       FROM seguridad_vial.usuario WHERE id = $1 AND estado = 'ACTIVO'`,
      [userId],
    );
    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException();
    }
    const roles = await this.getRoles(user.id);
    const [permissions, alcance] = await Promise.all([
      this.getPermissions(user.id, roles),
      this.getAlcance(user.id),
    ]);
    return this.toAuthUser(user, roles, permissions, alcance);
  }

  async getAlcance(userId: string): Promise<{ seccionesTodas: boolean; secciones: string[] }> {
    const result = await this.db.query<{
      secciones_todas: boolean;
      secciones: string[] | null;
    }>(
      `SELECT u.secciones_todas,
              coalesce(
                (SELECT array_agg(s.seccion ORDER BY s.seccion)
                 FROM seguridad_vial.usuario_seccion s
                 WHERE s.usuario_id = u.id),
                '{}'
              ) AS secciones
       FROM seguridad_vial.usuario u
       WHERE u.id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return { seccionesTodas: false, secciones: [] };
    if (row.secciones_todas) return { seccionesTodas: true, secciones: [] };
    return { seccionesTodas: false, secciones: row.secciones ?? [] };
  }

  async getPermissions(userId: string, roles?: RoleCode[]): Promise<PermissionCode[]> {
    const result = await this.db.query<{ codigo: string }>(
      `SELECT DISTINCT p.codigo
       FROM seguridad_vial.usuario_permiso up
       JOIN seguridad_vial.permiso p ON p.id = up.permiso_id
       WHERE up.usuario_id = $1`,
      [userId],
    );
    if (result.rows.length) {
      return result.rows.map((r) => r.codigo as PermissionCode);
    }
    const known = roles ?? (await this.getRoles(userId));
    return defaultsDeTipo(tipoPrincipal(known));
  }

  async changePassword(userId: string, actual: string, password: string) {
    if (!password || password.length < 8) {
      throw new BadRequestException('La contraseña nueva tiene que tener al menos 8 caracteres');
    }
    const result = await this.db.query<{ hash_clave: string | null }>(
      `SELECT hash_clave FROM seguridad_vial.usuario
       WHERE id = $1 AND estado = 'ACTIVO'`,
      [userId],
    );
    const row = result.rows[0];
    if (!row?.hash_clave) throw new UnauthorizedException();
    const ok = await bcrypt.compare(actual, row.hash_clave);
    if (!ok) {
      throw new UnauthorizedException('La contraseña actual no coincide');
    }
    const hash = await bcrypt.hash(password, 10);
    await this.db.query(
      `UPDATE seguridad_vial.usuario
       SET hash_clave = $2, actualizado_en = now()
       WHERE id = $1`,
      [userId, hash],
    );
    void this.audit
      .registrar({
        usuarioId: userId,
        entidad: 'sesion',
        accion: 'CLAVE',
        motivo: 'Cambió su contraseña',
      })
      .catch(() => undefined);
    return { ok: true };
  }

  async requestPasswordReset(username: string, ip?: string | null) {
    const clave = username.trim();
    if (clave.length < 3) {
      throw new BadRequestException('Escribí el email');
    }
    const result = await this.db.query<{ id: string }>(
      `SELECT id
       FROM seguridad_vial.usuario
       WHERE estado = 'ACTIVO'
         AND (
           nombre_usuario = $1
           OR lower(btrim(coalesce(email, ''))) = lower(btrim($1))
         )
       ORDER BY CASE WHEN nombre_usuario = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [clave],
    );
    const user = result.rows[0];
    if (user) {
      await this.audit
        .registrar({
          usuarioId: user.id,
          entidad: 'sesion',
          accion: 'CLAVE_PEDIDO',
          motivo: `Pidió reset de contraseña: ${clave.slice(0, 80)}`,
          ip,
        })
        .catch(() => undefined);
    }
    return { ok: true };
  }

  private toAuthUser(
    user: {
      id: string;
      nombre_usuario: string;
      nombre_mostrar: string;
      legajo?: string | null;
      apellido?: string | null;
      nombres?: string | null;
    },
    roles: RoleCode[],
    permissions: PermissionCode[],
    alcance: { seccionesTodas: boolean; secciones: string[] },
  ): AuthUserDto {
    return {
      id: user.id,
      username: user.nombre_usuario,
      displayName: user.nombre_mostrar,
      roles,
      permissions,
      seccionesTodas: alcance.seccionesTodas,
      secciones: alcance.secciones,
      legajo: user.legajo || null,
      apellido: user.apellido || null,
      nombres: user.nombres || null,
    };
  }

  static readonly Role = ROLE_CODES;
}
