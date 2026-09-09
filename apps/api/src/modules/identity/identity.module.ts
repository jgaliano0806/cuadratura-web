import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    AuditModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'cambio-local-mvp-seguridad-vial',
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, JwtStrategy, RolesGuard],
  exports: [IdentityService, JwtModule, RolesGuard],
})
export class IdentityModule {}
