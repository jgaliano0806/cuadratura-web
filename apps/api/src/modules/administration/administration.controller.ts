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
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ADMIN_PERMISSIONS, PERMISSION_CODES, ROLE_CODES, type AlcanceSecciones } from '@plataforma/shared';
import { Permissions, Roles, RolesGuard } from '../identity/roles.guard';
import { CurrentUser, type RequestUser } from '../identity/current-user.decorator';
import { AdministrationService } from './administration.service';

const SECCIONES_VALIDAS = [
  'MOVILES', 'EPI', 'BO',
  'APC', 'AUTOVIA_CALAMUCHITA', 'AUTOVIA_PUNILLA',
  'RUTA_19', 'RUTA_20', 'RUTA_2JC',
  'RUTA_36', 'RUTA_36_ARROYO_TEGUA', 'RUTA_36_PIEDRAS_MORAS',
  'RUTA_5', 'RUTA_9_NORTE', 'RUTA_9_SUR',
  'RUTA_E53', 'RUTA_E55',
] as const;

function alcanceDe(user: RequestUser): AlcanceSecciones {
  return {
    seccionesTodas: Boolean(user.seccionesTodas),
    secciones: user.secciones ?? [],
  };
}

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

class CreateUserDto {
  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre_usuario?: string;

  @IsString()
  @MinLength(1)
  apellido!: string;

  @IsString()
  @MinLength(1)
  nombres!: string;

  @IsEmail()
  email!: string;

  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @IsOptional()
  @IsString()
  legajo?: string;

  @IsArray()
  @IsString({ each: true })
  roles!: string[];

  @IsOptional()
  @IsArray()
  @IsIn(Object.values(PERMISSION_CODES), { each: true })
  permisos?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(SECCIONES_VALIDAS, { each: true })
  secciones?: string[];

  @IsOptional()
  @IsBoolean()
  secciones_todas?: boolean;

  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado?: 'ACTIVO' | 'INACTIVO';
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre_usuario?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  apellido?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nombres?: string;

  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsString()
  legajo?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(Object.values(PERMISSION_CODES), { each: true })
  permisos?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(SECCIONES_VALIDAS, { each: true })
  secciones?: string[];

  @IsOptional()
  @IsBoolean()
  secciones_todas?: boolean;

  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado?: 'ACTIVO' | 'INACTIVO';
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
@Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE, ROLE_CODES.RH)
@Permissions(...ADMIN_PERMISSIONS)
export class AdministrationController {
  constructor(private readonly admin: AdministrationService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('inspectors')
  @Permissions(PERMISSION_CODES.PERSONAS_GESTIONAR)
  inspectors(@CurrentUser() user: RequestUser) {
    return this.admin.inspectors(alcanceDe(user));
  }

  @Get('inspectors/:id/historial')
  @Permissions(PERMISSION_CODES.PERSONAS_GESTIONAR)
  historialInspector(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.admin.historialInspector(id, alcanceDe(user));
  }

  @Post('inspectors')
  @Permissions(PERMISSION_CODES.PERSONAS_GESTIONAR)
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
      alcance: alcanceDe(user),
    });
  }

  @Patch('inspectors/:id')
  @Permissions(PERMISSION_CODES.PERSONAS_GESTIONAR)
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
      alcance: alcanceDe(user),
    });
  }

  @Delete('inspectors/:id')
  @Permissions(PERMISSION_CODES.PERSONAS_GESTIONAR)
  deactivateInspector(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.admin.deactivateInspector(id, alcanceDe(user));
  }

  @Get('positions-assignable')
  @Permissions(PERMISSION_CODES.PERSONAS_GESTIONAR, PERMISSION_CODES.POSICIONES_GESTIONAR)
  assignablePositions() {
    return this.admin.assignablePositions();
  }

  @Get('mobiles')
  @Permissions(PERMISSION_CODES.MOVILES_GESTIONAR)
  mobiles() {
    return this.admin.mobiles();
  }

  @Get('bases')
  @Permissions(PERMISSION_CODES.MOVILES_GESTIONAR)
  bases() {
    return this.admin.bases();
  }

  @Post('mobiles')
  @Permissions(PERMISSION_CODES.MOVILES_GESTIONAR)
  createMobile(@Body() body: CreateMobileDto) {
    return this.admin.createMobile({
      numero: body.numero,
      baseOperativaId: body.base_operativa_id,
      capacidadMaxima: body.capacidad_maxima,
      vigenciaDesde: body.vigencia_desde,
    });
  }

  @Patch('mobiles/:id')
  @Permissions(PERMISSION_CODES.MOVILES_GESTIONAR)
  updateMobile(@Param('id') id: string, @Body() body: UpdateMobileDto) {
    return this.admin.updateMobile(id, {
      baseOperativaId: body.base_operativa_id,
      capacidadMaxima: body.capacidad_maxima,
      estado: body.estado,
    });
  }

  @Delete('mobiles/:id')
  @Permissions(PERMISSION_CODES.MOVILES_GESTIONAR)
  deactivateMobile(@Param('id') id: string) {
    return this.admin.deactivateMobile(id);
  }

  @Get('positions')
  @Permissions(PERMISSION_CODES.POSICIONES_GESTIONAR, PERMISSION_CODES.PERSONAS_GESTIONAR)
  positions() {
    return this.admin.positions();
  }

  @Post('positions')
  @Permissions(PERMISSION_CODES.POSICIONES_GESTIONAR, PERMISSION_CODES.PERSONAS_GESTIONAR)
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
  @Permissions(PERMISSION_CODES.PERFILES_GESTIONAR, PERMISSION_CODES.PERSONAS_GESTIONAR)
  profiles() {
    return this.admin.profiles();
  }

  @Get('users')
  @Permissions(PERMISSION_CODES.USUARIOS_ADMINISTRAR)
  users() {
    return this.admin.users();
  }

  @Get('roles')
  @Permissions(PERMISSION_CODES.USUARIOS_ADMINISTRAR)
  roles() {
    return this.admin.listRoles();
  }

  @Post('users')
  @Permissions(PERMISSION_CODES.USUARIOS_ADMINISTRAR)
  async createUser(@Body() body: CreateUserDto) {
    const creado = await this.admin.createUser({
      nombreUsuario: body.nombre_usuario,
      apellido: body.apellido,
      nombres: body.nombres,
      email: body.email,
      legajo: body.legajo,
      roles: body.roles,
      permisos: body.permisos,
      secciones: body.secciones,
      seccionesTodas: body.secciones_todas,
      estado: body.estado,
    });
    const lista = await this.admin.users();
    const user = lista.find((u) => u.id === creado.id) ?? { id: creado.id };
    return { ...user, clave_inicial: creado.clave };
  }

  @Patch('users/:id/password')
  @Permissions(PERMISSION_CODES.USUARIOS_ADMINISTRAR)
  resetUserPassword(@Param('id') id: string) {
    return this.admin.resetUserPassword(id);
  }

  @Patch('users/:id')
  @Permissions(PERMISSION_CODES.USUARIOS_ADMINISTRAR)
  updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.admin.updateUser(id, {
      nombreUsuario: body.nombre_usuario,
      apellido: body.apellido,
      nombres: body.nombres,
      email: body.email,
      legajo: body.legajo,
      roles: body.roles,
      permisos: body.permisos,
      secciones: body.secciones,
      seccionesTodas: body.secciones_todas,
      estado: body.estado,
    });
  }

  @Delete('users/:id')
  @Permissions(PERMISSION_CODES.USUARIOS_ADMINISTRAR)
  deleteUser(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.admin.deleteUser(id, user.userId);
  }

  @Get('linked-groups')
  @Permissions(PERMISSION_CODES.PERSONAS_GESTIONAR)
  linkedGroups() {
    return this.admin.linkedGroups();
  }

  @Get('licencias')
  @Permissions(PERMISSION_CODES.LICENCIAS_GESTIONAR)
  licencias() {
    return this.admin.listLicencias();
  }

  @Post('licencias')
  @Permissions(PERMISSION_CODES.LICENCIAS_GESTIONAR)
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
  @Permissions(PERMISSION_CODES.LICENCIAS_GESTIONAR)
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
  @Permissions(PERMISSION_CODES.LICENCIAS_GESTIONAR)
  deleteLicencia(@Param('id') id: string) {
    return this.admin.deleteLicencia(id);
  }

  @Get('timer-motivos')
  @Permissions(PERMISSION_CODES.MOTIVOS_GESTIONAR)
  timerMotivos() {
    return this.admin.listTimerMotivos();
  }

  @Post('timer-motivos')
  @Permissions(PERMISSION_CODES.MOTIVOS_GESTIONAR)
  createTimerMotivo(@Body() body: CreateTimerMotivoDto) {
    return this.admin.createTimerMotivo({
      nombre: body.nombre,
      orden: body.orden,
    });
  }

  @Patch('timer-motivos/:id')
  @Permissions(PERMISSION_CODES.MOTIVOS_GESTIONAR)
  updateTimerMotivo(@Param('id') id: string, @Body() body: UpdateTimerMotivoDto) {
    return this.admin.updateTimerMotivo(id, {
      nombre: body.nombre,
      activo: body.activo,
      orden: body.orden,
    });
  }

  @Delete('timer-motivos/:id')
  @Permissions(PERMISSION_CODES.MOTIVOS_GESTIONAR)
  deleteTimerMotivo(@Param('id') id: string) {
    return this.admin.deleteTimerMotivo(id);
  }
}
