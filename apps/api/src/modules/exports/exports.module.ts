import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

/** Exportación de cuadraturas a Excel (formato en uso por el sector). */
@Module({
  controllers: [ExportsController],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
