import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PERMISSION_CODES, ROLE_CODES } from '@plataforma/shared';
import { Permissions, Roles, RolesGuard } from '../identity/roles.guard';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLE_CODES.AUDITOR, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE)
@Permissions(PERMISSION_CODES.AUDITORIA_CONSULTAR)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.audit.list(limit ? Number(limit) : 50);
  }
}
