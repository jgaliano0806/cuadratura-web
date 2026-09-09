import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { PERMISSION_CODES, ROLE_CODES, VACATION_DURATIONS } from '@plataforma/shared';
import { CurrentUser, RequestUser } from '../identity/current-user.decorator';
import { Permissions, Roles, RolesGuard } from '../identity/roles.guard';
import { VacationsService } from './vacations.service';

class CreateVacationDto {
  @IsUUID()
  inspectorId!: string;

  @IsString()
  dateFrom!: string;

  @IsIn([...VACATION_DURATIONS])
  days!: number;

  @IsString()
  @MinLength(5)
  reason!: string;

  @IsOptional()
  @IsIn(['PLANIFICADA', 'REAL'])
  layer?: 'PLANIFICADA' | 'REAL';

  @IsOptional()
  @IsUUID()
  versionId?: string;
}

class AssignDemandDto {
  @IsUUID()
  versionId!: string;
}

@Controller('vacations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class VacationsController {
  constructor(private readonly vacations: VacationsService) {}

  @Get()
  list() {
    return this.vacations.list();
  }

  @Post()
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.JEFE)
  @Permissions(PERMISSION_CODES.VACACIONES_GESTIONAR)
  create(@Body() body: CreateVacationDto, @CurrentUser() user: RequestUser) {
    return this.vacations.create(body, user.userId);
  }

  @Get(':id/demand-work/proposals')
  proposals(
    @Param('id') id: string,
    @Query('version_id') versionId: string,
  ) {
    return this.vacations.proposals(id, versionId);
  }

  @Post(':id/demand-work/assign')
  @Roles(ROLE_CODES.ADMIN_SV, ROLE_CODES.JEFE)
  @Permissions(PERMISSION_CODES.VACACIONES_GESTIONAR)
  assign(
    @Param('id') id: string,
    @Body() body: AssignDemandDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vacations.assign(id, body.versionId, user.userId);
  }
}
