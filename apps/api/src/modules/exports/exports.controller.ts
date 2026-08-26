import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { ROLE_CODES } from '@plataforma/shared';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { ExportsService } from './exports.service';

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
  )
  async version(
    @Param('id') id: string,
    @Query('pack') pack: string | undefined,
    @Res() res: Response,
  ) {
    const kind =
      pack === 'cuadratura' || pack === 'planillas' || pack === 'todo'
        ? pack
        : 'todo';
    const { buffer, fileName } = await this.exports.workbook(id, kind);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }
}
