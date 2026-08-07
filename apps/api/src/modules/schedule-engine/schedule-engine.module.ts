import { Module } from '@nestjs/common';
import { ScheduleEngineController } from './schedule-engine.controller';
import { ScheduleEngineService } from './schedule-engine.service';

@Module({
  controllers: [ScheduleEngineController],
  providers: [ScheduleEngineService],
  exports: [ScheduleEngineService],
})
export class ScheduleEngineModule {}
