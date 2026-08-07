import { Module } from '@nestjs/common';
import { VacationsController } from './vacations.controller';
import { VacationsService } from './vacations.service';

@Module({
  controllers: [VacationsController],
  providers: [VacationsService],
  exports: [VacationsService],
})
export class VacationsModule {}
