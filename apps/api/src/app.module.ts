import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InitializationModule } from './modules/bootstrap-initialization/initialization.module';
import { CoverageModule } from './modules/coverage/coverage.module';
import { OperationsModule } from './modules/operations/operations.module';
import { PlanningModule } from './modules/planning/planning.module';
import { VacationsModule } from './modules/vacations/vacations.module';
import { AuditModule } from './modules/audit/audit.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { ScheduleEngineModule } from './modules/schedule-engine/schedule-engine.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '../../../.env'),
        join(process.cwd(), '.env'),
        join(process.cwd(), '../../.env'),
      ],
    }),
    DatabaseModule,
    IdentityModule,
    InitializationModule,
    CoverageModule,
    OperationsModule,
    PlanningModule,
    VacationsModule,
    AuditModule,
    AdministrationModule,
    ScheduleEngineModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
