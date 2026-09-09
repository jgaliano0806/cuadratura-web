import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PERMISSION_CODES, ROLE_CODES } from '@plataforma/shared';
import { CurrentUser, type RequestUser } from '../identity/current-user.decorator';
import { Permissions, Roles, RolesGuard } from '../identity/roles.guard';
import { ExportsService } from './exports.service';

class TimerFilaDto {
  @IsDateString()
  fecha!: string;

  @Transform(({ value }) => (value ? String(value) : undefined))
  @IsOptional()
  @IsUUID()
  inspector_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  legajo?: string;

  @IsString()
  @MaxLength(120)
  persona!: string;

  @IsIn(['auto', 'extra'])
  origen!: 'auto' | 'extra';

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

class TimerExportDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @Transform(({ value }) => (value ? String(value) : undefined))
  @IsOptional()
  @IsUUID()
  guardado_id?: string;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => TimerFilaDto)
  filas!: TimerFilaDto[];
}

class TablaHojaDto {
  @IsString()
  @MaxLength(31)
  name!: string;

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  headers!: string[];

  @IsArray()
  @ArrayMaxSize(5000)
  rows!: Array<Array<string | number | null>>;
}

class TablaExportDto {
  @IsString()
  @MaxLength(80)
  fileName!: string;

  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => TablaHojaDto)
  sheets!: TablaHojaDto[];
}

@Controller('exports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  /** Descarga Excel: cuadratura, planillas por móvil, o ambos. */
  @Get('version/:id.xlsx')
  @Roles(
    ROLE_CODES.ADMIN_SV,
    ROLE_CODES.ADMIN_SYS,
    ROLE_CODES.JEFE,
    ROLE_CODES.CONSULTA,
    ROLE_CODES.RH,
    ROLE_CODES.AUDITOR,
  )
  @Permissions(PERMISSION_CODES.EXCEL_EXPORTAR)
  async version(
    @Param('id') id: string,
    @Query('pack') pack: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('inspectores') inspectores: string | undefined,
    @Query('secciones') secciones: string | undefined,
    @Query('codigos') codigos: string | undefined,
    @Query('moviles') moviles: string | undefined,
    @Query('turnos') turnos: string | undefined,
    @Res() res: Response,
  ) {
    const kind =
      pack === 'cuadratura' || pack === 'planillas' || pack === 'todo'
        ? pack
        : 'todo';
    const csv = (v?: string) =>
      (v ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const { buffer, fileName } = await this.exports.workbook(id, kind, {
      from: from?.slice(0, 10) || undefined,
      to: to?.slice(0, 10) || undefined,
      inspectores: csv(inspectores),
      secciones: csv(secciones),
      codigos: csv(codigos),
      moviles: csv(moviles),
      turnos: csv(turnos),
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  /** Timer: diferencias Ideal vs Real del período, más novedades agregadas. */
  @Post('timer.xlsx')
  @Roles(
    ROLE_CODES.ADMIN_SV,
    ROLE_CODES.ADMIN_SYS,
    ROLE_CODES.JEFE,
    ROLE_CODES.CONSULTA,
    ROLE_CODES.RH,
    ROLE_CODES.AUDITOR,
  )
  @Permissions(PERMISSION_CODES.EXCEL_EXPORTAR)
  async timer(
    @Body() body: TimerExportDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.exports.timer(
      body.from,
      body.to,
      body.filas.map((f) => ({
        fecha: f.fecha,
        inspector_id: f.inspector_id,
        legajo: f.legajo ?? '',
        persona: f.persona,
        origen: f.origen,
        ideal: f.ideal ?? '',
        real: f.real ?? '',
        motivo: f.motivo ?? '',
        observacion: f.observacion ?? '',
      })),
      { userId: user.userId, guardadoId: body.guardado_id },
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  @Post('tabla.xlsx')
  @Roles(
    ROLE_CODES.ADMIN_SV,
    ROLE_CODES.ADMIN_SYS,
    ROLE_CODES.JEFE,
    ROLE_CODES.CONSULTA,
    ROLE_CODES.RH,
    ROLE_CODES.AUDITOR,
  )
  @Permissions(PERMISSION_CODES.EXCEL_EXPORTAR)
  async tabla(@Body() body: TablaExportDto, @Res() res: Response) {
    const { buffer, fileName } = await this.exports.tabla({
      fileName: body.fileName,
      sheets: body.sheets.map((s) => ({
        name: s.name,
        headers: s.headers,
        rows: s.rows,
      })),
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }
}
