import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { PERMISSION_CODES, ROLE_CODES } from '@plataforma/shared';
import { CurrentUser, RequestUser } from '../identity/current-user.decorator';
import { Permissions, Roles, RolesGuard } from '../identity/roles.guard';
import { PlanningService } from './planning.service';

class ObserveDto {
  @IsString()
  @MinLength(5)
  observation!: string;
}

@Controller('planning')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Get('versions')
  listVersions(@Query('capa') capa?: string) {
    return this.planning.listVersions(capa);
  }

  @Get(':id/calendar')
  calendar(
    @Param('id') id: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('mobile') mobile?: string,
  ) {
    return this.planning.calendar(
      id,
      dateFrom,
      dateTo,
      mobile ? Number(mobile) : undefined,
    );
  }

  @Post(':id/submit')
  @Roles(ROLE_CODES.ADMIN_SV)
  @Permissions(PERMISSION_CODES.PLANIFICACION_ENVIAR_REVISION)
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.planning.submit(id, user.userId);
  }

  @Post(':id/observe')
  @Roles(ROLE_CODES.JEFE)
  @Permissions(PERMISSION_CODES.PLANIFICACION_OBSERVAR)
  observe(
    @Param('id') id: string,
    @Body() body: ObserveDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.planning.observe(id, body.observation, user.userId);
  }

  @Post(':id/reopen')
  @Roles(ROLE_CODES.ADMIN_SV)
  @Permissions(PERMISSION_CODES.PLANIFICACION_CREAR)
  reopen(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.planning.reopen(id, user.userId);
  }

  @Post(':id/approve-and-publish')
  @Roles(ROLE_CODES.JEFE)
  @Permissions(PERMISSION_CODES.PLANIFICACION_APROBAR_PUBLICAR)
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.planning.approveAndPublish(id, user.userId);
  }

  @Post(':id/close')
  @Roles(ROLE_CODES.JEFE)
  @Permissions(PERMISSION_CODES.PLANIFICACION_CERRAR)
  close(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.planning.close(id, user.userId);
  }
}
