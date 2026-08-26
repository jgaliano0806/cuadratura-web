import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CoverageService } from './coverage.service';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
export class CoverageController {
  constructor(private readonly coverage: CoverageService) {}

  /** Huecos de cobertura. Todos los filtros son opcionales. */
  @Get('gaps')
  gaps(
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('mobile') mobile?: string,
    @Query('shift') shift?: string,
    @Query('acceptance') acceptance?: string,
    @Query('version_id') versionId?: string,
  ) {
    const movil = mobile ? Number(mobile) : undefined;
    return this.coverage.gaps({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      mobile: Number.isFinite(movil) ? movil : undefined,
      shift: shift || undefined,
      acceptance: acceptance || undefined,
      versionId: versionId || undefined,
    });
  }
}
