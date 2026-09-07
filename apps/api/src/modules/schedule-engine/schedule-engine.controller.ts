import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ROLE_CODES } from '@plataforma/shared';
import { CurrentUser, RequestUser } from '../identity/current-user.decorator';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { ScheduleEngineService } from './schedule-engine.service';

class DesdoblesDto {
  @IsDateString()
  date_from!: string;

  @IsDateString()
  date_to!: string;

  /**
   * Habilita el móvil 4 como destino cuando la pareja está llena. Comparte
   * franja horaria, pero se gestiona a mano: por defecto queda deshabilitado.
   */
  @IsOptional()
  @IsBoolean()
  permitir_movil4?: boolean;
}

class ProjectDto {
  @IsDateString()
  date_from!: string;

  @IsDateString()
  date_to!: string;
}

class OcupacionDto {
  @IsDateString()
  date_from!: string;

  @IsDateString()
  date_to!: string;

  /** Devuelve el reparto crudo, antes de resolver las superposiciones. */
  @IsOptional()
  @IsBoolean()
  sin_desdoblar?: boolean;

  /** Ver `DesdoblesDto.permitir_movil4`. Solo aplica si se desdobla. */
  @IsOptional()
  @IsBoolean()
  permitir_movil4?: boolean;
}

class ClearRangeDto {
  @IsOptional()
  @IsUUID()
  inspector_id?: string;

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

class AssignmentDto {
  @IsUUID()
  inspector_id!: string;

  @IsDateString()
  date_from!: string;

  @IsDateString()
  date_to!: string;

  /** Turno destino. Si se omite, se conserva el de la cuadratura base. */
  @IsOptional()
  @IsIn(['M', 'T', 'N'])
  shift?: 'M' | 'T' | 'N';

  /** Móvil destino. Si se omite, se conserva el de la cuadratura base. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  mobile?: number;

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
  @IsUUID()
  catalogo_licencia_id?: string;

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

  /**
   * Ocupación por móvil, turno y día: cuántos inspectores hay en cada uno y
   * quiénes son, más los totales por día y por móvil. Solo lee.
   */
  @Post('ocupacion')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE, ROLE_CODES.CONSULTA)
  ocupacion(@Body() body: OcupacionDto) {
    return this.engine.ocupacion(body.date_from, body.date_to, {
      sinDesdoblar: body.sin_desdoblar ?? false,
      permitirMovil4: body.permitir_movil4 ?? false,
    });
  }

  /**
   * Superposiciones de 3 inspectores en un móvil y cómo se resolverían.
   * Simula: devuelve cada movimiento con su justificación, sin escribir nada.
   */
  @Post('desdobles/preview')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE)
  previewDesdobles(@Body() body: DesdoblesDto) {
    return this.engine.previewDesdobles(
      body.date_from,
      body.date_to,
      body.permitir_movil4 ?? false,
    );
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

  /** Cambio de turno y/o móvil por un rango (overlay REAL; no toca PLAN). */
  @Post('assignment')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE)
  assignment(@Body() body: AssignmentDto, @CurrentUser() user: RequestUser) {
    return this.engine.registerOperationalAssignment({
      inspectorId: body.inspector_id,
      dateFrom: body.date_from,
      dateTo: body.date_to,
      shift: body.shift ?? null,
      mobile: body.mobile ?? null,
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
      catalogoLicenciaId: body.catalogo_licencia_id,
      rematerialize: body.rematerialize ?? true,
    });
  }

  /** Saca overlays de Real en un rango; esos días vuelven a Ideal. */
  @Post('clear-range')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE)
  clearRange(@Body() body: ClearRangeDto, @CurrentUser() user: RequestUser) {
    return this.engine.clearOperationalRange({
      inspectorId: body.inspector_id ?? null,
      dateFrom: body.date_from,
      dateTo: body.date_to,
      userId: user.userId,
      reason: body.reason,
      rematerialize: body.rematerialize ?? true,
    });
  }
}
