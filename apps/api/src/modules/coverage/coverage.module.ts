import { Module } from '@nestjs/common';
import { CoverageController } from './coverage.controller';
import { CoverageService } from './coverage.service';

/**
 * Reportes de cobertura (huecos).
 *
 * Reconstruido: `app.module.ts` importaba este módulo pero la carpeta no estaba
 * en el repositorio, así que la API no compilaba. El contrato se derivó de lo
 * que ya existía: la llamada de la web (`GET /reports/gaps` en GapsPage), el
 * tipo `GapRow` de @plataforma/shared y la función `fn_tablero_huecos` (V011).
 */
@Module({
  controllers: [CoverageController],
  providers: [CoverageService],
  exports: [CoverageService],
})
export class CoverageModule {}
