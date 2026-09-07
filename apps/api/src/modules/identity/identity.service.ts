import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { ROLE_CODES, type AuthUserDto, type RoleCode } from '@plataforma/shared';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class IdentityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const result = await this.db.query<{
      id: string;
      nombre_usuario: string;
      nombre_mostrar: string;
      hash_clave: string | null;
      estado: string;
    }>(
      `SELECT id, nombre_usuario, nombre_mostrar, hash_clave, estado
       FROM seguridad_vial.usuario
       WHERE nombre_usuario = $1`,
      [username],
    );
    const user = result.rows[0];
    if (!user || user.estado !== 'ACTIVO' || !user.hash_clave) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const ok = await bcrypt.compare(password, user.hash_clave);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const roles = await this.getRoles(user.id);
    const dto: AuthUserDto = {
      id: user.id,
      username: user.nombre_usuario,
      displayName: user.nombre_mostrar,
      roles,
    };
    const accessToken = await this.jwt.signAsync({
      sub: dto.id,
      username: dto.username,
      roles: dto.roles,
    });
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
    }>(
      `SELECT id, nombre_usuario, nombre_mostrar
       FROM seguridad_vial.usuario WHERE id = $1 AND estado = 'ACTIVO'`,
      [userId],
    );
    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      username: user.nombre_usuario,
      displayName: user.nombre_mostrar,
      roles: await this.getRoles(user.id),
    };
  }

  static readonly Role = ROLE_CODES;
}
