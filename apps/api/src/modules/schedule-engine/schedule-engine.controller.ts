import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
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

class InspectorSwapDto {
  @IsUUID()
  inspector_a_id!: string;

  @IsUUID()
  inspector_b_id!: string;

  @IsDateString()
  date_from!: string;

  @IsDateString()
  date_to!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  rematerialize?: boolean;
}

class AbsenceDto {
  @IsUUID()
  inspector_id!: string;

  @IsDateString()
  date_from!: string;

  @IsDateString()
  date_to!: string;

  @IsIn(['VACACION', 'LICENCIA', 'FERIADO', 'ENFERMEDAD'])
  kind!: 'VACACION' | 'LICENCIA' | 'FERIADO' | 'ENFERMEDAD';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  rematerialize?: boolean;
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

  /** Enroque entre dos inspectores cualquiera (overlays; no toca PLAN). */
  @Post('swap')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE)
  inspectorSwap(
    @Body() body: InspectorSwapDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.engine.registerInspectorSwap({
      inspectorAId: body.inspector_a_id,
      inspectorBId: body.inspector_b_id,
      dateFrom: body.date_from,
      dateTo: body.date_to,
      userId: user.userId,
      reason: body.reason,
      rematerialize: body.rematerialize ?? true,
    });
  }

  /** Vacación / licencia / feriado / enfermedad operativa (overlay REAL). */
  @Post('absence')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE)
  absence(@Body() body: AbsenceDto, @CurrentUser() user: RequestUser) {
    return this.engine.registerOperationalAbsence({
      inspectorId: body.inspector_id,
      dateFrom: body.date_from,
      dateTo: body.date_to,
      kind: body.kind,
      userId: user.userId,
      reason: body.reason,
      rematerialize: body.rematerialize ?? true,
    });
  }
}
