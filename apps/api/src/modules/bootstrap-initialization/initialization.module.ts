import { Module } from '@nestjs/common';
import { InitializationController } from './initialization.controller';
import { InitializationService } from './initialization.service';
import { InitializationRepository } from './initialization.repository';

@Module({
  controllers: [InitializationController],
  providers: [InitializationService, InitializationRepository],
  exports: [InitializationService],
})
export class InitializationModule {}
