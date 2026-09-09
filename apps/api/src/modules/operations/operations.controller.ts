import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PERMISSION_CODES } from '@plataforma/shared';
import { CurrentUser, type RequestUser } from '../identity/current-user.decorator';
import { Permissions, RolesGuard } from '../identity/roles.guard';
import { OperationsService } from './operations.service';

class TimerExtraCreateDto {
  @IsUUID()
  inspector_id!: string;

  @IsDateString()
  fecha!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(400)
  motivo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  observacion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ideal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  real?: string;
}

class TimerExtraPatchDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(400)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  observacion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ideal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  real?: string;
}

class TimerGuardadoFilaDto {
  @IsDateString()
  fecha!: string;

  @IsOptional()
  @IsUUID()
  inspector_id?: string;

  @IsIn(['auto', 'extra'])
  origen!: 'auto' | 'extra';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  legajo?: string;

  @IsString()
  @MaxLength(120)
  persona!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ideal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  real?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  observacion?: string;
}

class TimerGuardadoCreateDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nota?: string;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => TimerGuardadoFilaDto)
  filas!: TimerGuardadoFilaDto[];
}

@Controller('operations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('mobile4/positions')
  mobile4() {
    return this.operations.mobile4Positions();
  }

  @Get('ruta36/positions')
  ruta36() {
    return this.operations.ruta36Positions();
  }

  @Get('inspectors')
  inspectors(@CurrentUser() user: RequestUser) {
    return this.operations.listInspectors({
      seccionesTodas: Boolean(user.seccionesTodas),
      secciones: user.secciones ?? [],
    });
  }

  @Get('licencias')
  licencias(
    @Query('activas') activas?: string,
    @Query('turnos') turnos?: string,
  ) {
    return this.operations.listLicencias(
      activas === '1' || activas === 'true',
      turnos === '1' || turnos === 'true',
    );
  }

  @Get('timer-motivos')
  timerMotivos() {
    return this.operations.listTimerMotivos();
  }

  @Get('mobiles')
  mobiles() {
    return this.operations.listMobiles();
  }

  @Get('timer-extras')
  timerExtras(@Query('from') from: string, @Query('to') to: string) {
    return this.operations.listTimerExtras(from, to);
  }

  @Post('timer-extras')
  @Permissions(PERMISSION_CODES.TIMER_CARGAR)
  createTimerExtra(@Body() body: TimerExtraCreateDto, @CurrentUser() user: RequestUser) {
    return this.operations.createTimerExtra(user.userId, body);
  }

  @Patch('timer-extras/:id')
  @Permissions(PERMISSION_CODES.TIMER_CARGAR)
  async patchTimerExtra(@Param('id') id: string, @Body() body: TimerExtraPatchDto) {
    const row = await this.operations.updateTimerExtra(id, body);
    if (!row) throw new NotFoundException('Novedad no encontrada.');
    return row;
  }

  @Delete('timer-extras/:id')
  @Permissions(PERMISSION_CODES.TIMER_CARGAR)
  async deleteTimerExtra(@Param('id') id: string) {
    const ok = await this.operations.deleteTimerExtra(id);
    if (!ok) throw new NotFoundException('Novedad no encontrada.');
    return { ok: true };
  }

  @Get('timer-guardados')
  timerGuardados() {
    return this.operations.listTimerGuardados();
  }

  @Get('timer-guardados/:id')
  async timerGuardado(@Param('id') id: string) {
    const doc = await this.operations.getTimerGuardado(id);
    if (!doc) throw new NotFoundException('Timer no encontrado.');
    return doc;
  }

  @Post('timer-guardados')
  @Permissions(PERMISSION_CODES.TIMER_CARGAR)
  createTimerGuardado(
    @Body() body: TimerGuardadoCreateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operations.createTimerGuardado(user.userId, body);
  }
}
