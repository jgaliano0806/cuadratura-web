import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import type { PermissionCode, RoleCode } from '@plataforma/shared';

export type RequestUser = {
  userId: string;
  username: string;
  roles: RoleCode[];
  permissions: PermissionCode[];
  seccionesTodas: boolean;
  secciones: string[];
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
    return request.user;
  },
);
