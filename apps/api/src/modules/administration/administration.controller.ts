import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ROLE_CODES } from '@plataforma/shared';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { AdministrationService } from './administration.service';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE)
export class AdministrationController {
  constructor(private readonly admin: AdministrationService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('inspectors')
  inspectors() {
    return this.admin.inspectors();
  }

  @Get('mobiles')
  mobiles() {
    return this.admin.mobiles();
  }

  @Get('positions')
  positions() {
    return this.admin.positions();
  }

  @Get('profiles')
  profiles() {
    return this.admin.profiles();
  }

  @Get('users')
  users() {
    return this.admin.users();
  }

  @Get('linked-groups')
  linkedGroups() {
    return this.admin.linkedGroups();
  }
}
