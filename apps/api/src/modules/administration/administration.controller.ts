import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsArray,
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
import { Type } from 'class-transformer';
import { ROLE_CODES } from '@plataforma/shared';

const SECCIONES_VALIDAS = [
  'MOVILES', 'EPI', 'BO',
  'APC', 'AUTOVIA_CALAMUCHITA', 'AUTOVIA_PUNILLA',
  'RUTA_19', 'RUTA_20', 'RUTA_2JC',
  'RUTA_36', 'RUTA_36_ARROYO_TEGUA', 'RUTA_36_PIEDRAS_MORAS',
  'RUTA_5', 'RUTA_9_NORTE', 'RUTA_9_SUR',
  'RUTA_E53', 'RUTA_E55',
] as const;
import { Roles, RolesGuard } from '../identity/roles.guard';
import { CurrentUser, type RequestUser } from '../identity/current-user.decorator';
import { AdministrationService } from './administration.service';

class CreateInspectorDto {
  @IsString()
  @MinLength(1)
  nombres!: string;

  @IsString()
  @MinLength(1)
  apellido!: string;

  @IsString()
  @MinLength(1)
  legajo!: string;

  @IsOptional()
  @IsIn(['TITULAR', 'REEMPLAZANTE', 'PEAJISTA'])
  tipo_plantel?: 'TITULAR' | 'REEMPLAZANTE' | 'PEAJISTA';

  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @IsOptional()
  @IsUUID()
  posicion_id?: string;

  @IsOptional()
  @IsIn(SECCIONES_VALIDAS)
  seccion?: string;
}

class UpdateInspectorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nombres?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  apellido?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  legajo?: string;

  @IsOptional()
  @IsIn(['TITULAR', 'REEMPLAZANTE', 'PEAJISTA'])
  tipo_plantel?: 'TITULAR' | 'REEMPLAZANTE' | 'PEAJISTA';

  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @IsOptional()
  @IsUUID()
  posicion_id?: string;

  @IsOptional()
  @IsIn(SECCIONES_VALIDAS)
  seccion?: string;

  @IsOptional()
  @IsDateString()
  fecha_baja?: string;
}

class CreateLicenciaDto {
  @IsString()
  @MinLength(1)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  codigo?: string;

  @IsOptional()
  @IsString()
  codigo_sap?: string | null;

  @IsOptional()
  @IsString()
  horario?: string | null;

  @IsOptional()
  @IsIn(['SEGURIDAD_VIAL', 'BASE_OPERACIONES'])
  ambito?: 'SEGURIDAD_VIAL' | 'BASE_OPERACIONES';

  @IsOptional()
  @IsIn(['TURNO', 'AUSENCIA', 'FRANCO', 'OTRO'])
  tipo?: 'TURNO' | 'AUSENCIA' | 'FRANCO' | 'OTRO';

  @IsOptional()
  @IsString()
  color_fondo?: string | null;

  @IsOptional()
  @IsString()
  color_letra?: string | null;
}

class CreateMobileDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  numero!: number;

  @IsUUID()
  base_operativa_id!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  capacidad_maxima?: number;

  @IsOptional()
  @IsDateString()
  vigencia_desde?: string;
}

class CreateTimerMotivoDto {
  @IsString()
  @MinLength(3)
  nombre!: string;

  @IsOptional()
  @IsInt()
  orden?: number;
}

class UpdateTimerMotivoDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsInt()
  orden?: number;
}

class UpdateMobileDto {
  @IsOptional()
  @IsUUID()
  base_operativa_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  capacidad_maxima?: number;

  @IsOptional()
  @IsIn(['ACTIVO', 'MANTENIMIENTO', 'FUERA_SERVICIO', 'REEMPLAZADO'])
  estado?: 'ACTIVO' | 'MANTENIMIENTO' | 'FUERA_SERVICIO' | 'REEMPLAZADO';
}

class UpdateLicenciaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  codigo?: string;

  @IsOptional()
  @IsString()
  codigo_sap?: string | null;

  @IsOptional()
  @IsString()
  horario?: string | null;

  @IsOptional()
  @IsIn(['SEGURIDAD_VIAL', 'BASE_OPERACIONES'])
  ambito?: 'SEGURIDAD_VIAL' | 'BASE_OPERACIONES';

  @IsOptional()
  @IsIn(['TURNO', 'AUSENCIA', 'FRANCO', 'OTRO'])
  tipo?: 'TURNO' | 'AUSENCIA' | 'FRANCO' | 'OTRO';

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsInt()
  orden?: number;

  @IsOptional()
  @IsString()
  color_fondo?: string | null;

  @IsOptional()
  @IsString()
  color_letra?: string | null;
}

class CreatePositionDto {
  @IsOptional()
  @IsIn(['GENERAL', 'MOVIL4', 'MOVIL6', 'MOVIL7'])
  tipo?: 'GENERAL' | 'MOVIL4' | 'MOVIL6' | 'MOVIL7';

  @IsOptional()
  @IsUUID()
  perfil_id?: string;

  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  moviles?: number[];

  @IsOptional()
  @IsArray()
  @IsIn(['M', 'N', 'T'], { each: true })
  turnos?: Array<'M' | 'N' | 'T'>;
}

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

  @Get('inspectors/:id/historial')
  historialInspector(@Param('id') id: string) {
    return this.admin.historialInspector(id);
  }

  @Post('inspectors')
  createInspector(
    @Body() body: CreateInspectorDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.admin.createInspector({
      nombres: body.nombres,
      apellido: body.apellido,
      legajo: body.legajo,
      tipoPlantel: body.tipo_plantel,
      fechaDesde: body.fecha_desde,
      posicionId: body.posicion_id,
      seccion: body.seccion,
      userId: user.userId,
    });
  }

  @Patch('inspectors/:id')
  updateInspector(
    @Param('id') id: string,
    @Body() body: UpdateInspectorDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.admin.updateInspector(id, {
      nombres: body.nombres,
      apellido: body.apellido,
      legajo: body.legajo,
      tipoPlantel: body.tipo_plantel,
      fechaDesde: body.fecha_desde,
      posicionId: body.posicion_id,
      seccion: body.seccion,
      userId: user.userId,
    });
  }

  @Delete('inspectors/:id')
  deactivateInspector(@Param('id') id: string) {
    return this.admin.deactivateInspector(id);
  }

  @Get('positions-assignable')
  assignablePositions() {
    return this.admin.assignablePositions();
  }

  @Get('mobiles')
  mobiles() {
    return this.admin.mobiles();
  }

  @Get('bases')
  bases() {
    return this.admin.bases();
  }

  @Post('mobiles')
  createMobile(@Body() body: CreateMobileDto) {
    return this.admin.createMobile({
      numero: body.numero,
      baseOperativaId: body.base_operativa_id,
      capacidadMaxima: body.capacidad_maxima,
      vigenciaDesde: body.vigencia_desde,
    });
  }

  @Patch('mobiles/:id')
  updateMobile(@Param('id') id: string, @Body() body: UpdateMobileDto) {
    return this.admin.updateMobile(id, {
      baseOperativaId: body.base_operativa_id,
      capacidadMaxima: body.capacidad_maxima,
      estado: body.estado,
    });
  }

  @Delete('mobiles/:id')
  deactivateMobile(@Param('id') id: string) {
    return this.admin.deactivateMobile(id);
  }

  @Get('positions')
  positions() {
    return this.admin.positions();
  }

  @Post('positions')
  createPosition(@Body() body: CreatePositionDto) {
    return this.admin.createPosition({
      tipo: body.tipo,
      perfilId: body.perfil_id,
      fechaDesde: body.fecha_desde,
      moviles: body.moviles,
      turnos: body.turnos,
    });
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

  @Get('licencias')
  licencias() {
    return this.admin.listLicencias();
  }

  @Post('licencias')
  createLicencia(@Body() body: CreateLicenciaDto) {
    return this.admin.createLicencia({
      nombre: body.nombre,
      codigo: body.codigo,
      codigo_sap: body.codigo_sap,
      horario: body.horario,
      ambito: body.ambito,
      tipo: body.tipo,
      color_fondo: body.color_fondo,
      color_letra: body.color_letra,
    });
  }

  @Patch('licencias/:id')
  updateLicencia(@Param('id') id: string, @Body() body: UpdateLicenciaDto) {
    return this.admin.updateLicencia(id, {
      nombre: body.nombre,
      codigo: body.codigo,
      codigo_sap: body.codigo_sap,
      horario: body.horario,
      ambito: body.ambito,
      tipo: body.tipo,
      activo: body.activo,
      orden: body.orden,
      color_fondo: body.color_fondo,
      color_letra: body.color_letra,
    });
  }

  @Delete('licencias/:id')
  deleteLicencia(@Param('id') id: string) {
    return this.admin.deleteLicencia(id);
  }

  @Get('timer-motivos')
  timerMotivos() {
    return this.admin.listTimerMotivos();
  }

  @Post('timer-motivos')
  createTimerMotivo(@Body() body: CreateTimerMotivoDto) {
    return this.admin.createTimerMotivo({
      nombre: body.nombre,
      orden: body.orden,
    });
  }

  @Patch('timer-motivos/:id')
  updateTimerMotivo(@Param('id') id: string, @Body() body: UpdateTimerMotivoDto) {
    return this.admin.updateTimerMotivo(id, {
      nombre: body.nombre,
      activo: body.activo,
      orden: body.orden,
    });
  }

  @Delete('timer-motivos/:id')
  deleteTimerMotivo(@Param('id') id: string) {
    return this.admin.deleteTimerMotivo(id);
  }
}
