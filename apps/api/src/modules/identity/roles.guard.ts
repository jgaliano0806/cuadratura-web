import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionCode, RoleCode } from '@plataforma/shared';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);
export const Permissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

type AuthRequestUser = {
  roles?: RoleCode[];
  permissions?: PermissionCode[];
};

function tieneAlguno<T>(have: T[] | undefined, need: T[] | undefined): boolean {
  if (!need?.length) return false;
  const set = new Set(have ?? []);
  return need.some((x) => set.has(x));
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const cls = context.getClass();
    const handlerRoles = this.reflector.get<RoleCode[]>(ROLES_KEY, handler);
    const handlerPerms = this.reflector.get<PermissionCode[]>(PERMISSIONS_KEY, handler);
    const classRoles = this.reflector.get<RoleCode[]>(ROLES_KEY, cls);
    const classPerms = this.reflector.get<PermissionCode[]>(PERMISSIONS_KEY, cls);

    const request = context.switchToHttp().getRequest<{ user?: AuthRequestUser }>();
    const user = request.user ?? {};

    if (handlerPerms?.length || handlerRoles?.length) {
      return (
        tieneAlguno(user.permissions, handlerPerms) ||
        tieneAlguno(user.roles, handlerRoles)
      );
    }
    if (classPerms?.length || classRoles?.length) {
      return (
        tieneAlguno(user.permissions, classPerms) ||
        tieneAlguno(user.roles, classRoles)
      );
    }
    return true;
  }
}
