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
  @IsDateString()
  fecha_baja?: string;
}

class CreateLicenciaDto {
  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsOptional()
  @IsString()
  codigo?: string;

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
  @MinLength(2)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  codigo?: string;

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
      color_fondo: body.color_fondo,
      color_letra: body.color_letra,
    });
  }

  @Patch('licencias/:id')
  updateLicencia(@Param('id') id: string, @Body() body: UpdateLicenciaDto) {
    return this.admin.updateLicencia(id, {
      nombre: body.nombre,
      codigo: body.codigo,
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
}
