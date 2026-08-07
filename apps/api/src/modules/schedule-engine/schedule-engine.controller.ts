import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';
import { ROLE_CODES } from '@plataforma/shared';
import { CurrentUser, RequestUser } from '../identity/current-user.decorator';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { ScheduleEngineService } from './schedule-engine.service';

class ProjectDto {
  @IsDateString()
  date_from!: string;

  @IsDateString()
  date_to!: string;
}

class WipeDto {
  @IsString()
  @MinLength(5)
  reason!: string;
}

class PairSwapDto {
  @IsDateString()
  date_from!: string;

  @IsDateString()
  date_to!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('schedule-engine')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ScheduleEngineController {
  constructor(private readonly engine: ScheduleEngineService) {}

  @Post('preview')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE)
  preview(@Body() body: ProjectDto) {
    return this.engine.preview(body.date_from, body.date_to);
  }

  @Post('apply')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS)
  apply(@Body() body: ProjectDto, @CurrentUser() user: RequestUser) {
    return this.engine.apply(body.date_from, body.date_to, user.userId);
  }

  /** Tabula rasa de toda la capa PLANIFICADA. */
  @Post('wipe-planificada')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS)
  wipePlanificada(@Body() body: WipeDto, @CurrentUser() user: RequestUser) {
    return this.engine.wipePlanificada(user.userId, body.reason);
  }

  /** Materializa REAL = PLAN + asignaciones operativas (dupla). */
  @Post('apply-real')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE)
  applyReal(@Body() body: ProjectDto, @CurrentUser() user: RequestUser) {
    return this.engine.applyReal(body.date_from, body.date_to, user.userId);
  }

  /** Registra intercambio Haro–Ramos en asignacion_operativa (no toca PLAN). */
  @Post('linked-pair/swap')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE)
  linkedPairSwap(@Body() body: PairSwapDto, @CurrentUser() user: RequestUser) {
    return this.engine.registerLinkedPairSwap(
      body.date_from,
      body.date_to,
      user.userId,
      body.reason,
    );
  }
}
