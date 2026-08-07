import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { ROLE_CODES } from '@plataforma/shared';
import { CurrentUser, RequestUser } from '../identity/current-user.decorator';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { InitializationService } from './initialization.service';
import { excelUploadOptions } from './upload.options';

class RevertDto {
  @IsString()
  @MinLength(5)
  reason!: string;
}

@Controller('initialization')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class InitializationController {
  constructor(private readonly service: InitializationService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Post('excel/preview')
  @Roles(ROLE_CODES.ADMIN_SYS, ROLE_CODES.ADMIN_SV)
  @UseInterceptors(FileInterceptor('file', excelUploadOptions))
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.service.preview(file.buffer, file.originalname);
  }

  @Post('excel/stage')
  @Roles(ROLE_CODES.ADMIN_SYS, ROLE_CODES.ADMIN_SV)
  @UseInterceptors(FileInterceptor('file', excelUploadOptions))
  stage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.stage(file.buffer, file.originalname, user.userId);
  }

  @Post(':id/confirm')
  @Roles(ROLE_CODES.ADMIN_SYS, ROLE_CODES.ADMIN_SV)
  confirm(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.confirm(id, user.userId);
  }

  @Post(':id/revert')
  @Roles(ROLE_CODES.ADMIN_SYS)
  revert(
    @Param('id') id: string,
    @Body() body: RevertDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.revert(id, user.userId, body.reason);
  }
}
