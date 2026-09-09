import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { RoleCode } from '@plataforma/shared';
import { IdentityService } from './identity.service';

export type JwtPayload = {
  sub: string;
  username: string;
  roles: RoleCode[];
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly identity: IdentityService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('JWT_SECRET') ?? 'cambio-local-mvp-seguridad-vial',
    });
  }

  async validate(payload: JwtPayload) {
    const roles = await this.identity.getRoles(payload.sub);
    const [permissions, alcance] = await Promise.all([
      this.identity.getPermissions(payload.sub, roles),
      this.identity.getAlcance(payload.sub),
    ]);
    return {
      userId: payload.sub,
      username: payload.username,
      roles,
      permissions,
      seccionesTodas: alcance.seccionesTodas,
      secciones: alcance.secciones,
    };
  }
}
