import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OperationsService } from './operations.service';

@Controller('operations')
@UseGuards(AuthGuard('jwt'))
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('mobile4/positions')
  mobile4() {
    return this.operations.mobile4Positions();
  }

  @Get('ruta36/positions')
  ruta36() {
    return this.operations.ruta36Positions();
  }

  @Get('inspectors')
  inspectors() {
    return this.operations.listInspectors();
  }

  @Get('licencias')
  licencias(@Query('activas') activas?: string) {
    return this.operations.listLicencias(activas === '1' || activas === 'true');
  }

  @Get('mobiles')
  mobiles() {
    return this.operations.listMobiles();
  }
}
