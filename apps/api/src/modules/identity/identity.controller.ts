import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { IdentityService } from './identity.service';

class LoginDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

class ResetPedidoDto {
  @IsString()
  @MinLength(3)
  username!: string;
}

class ChangeMyPasswordDto {
  @IsString()
  @MinLength(1)
  actual!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

@Controller('auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('login')
  login(
    @Body() body: LoginDto,
    @Req() req: { ip?: string; headers: Record<string, unknown>; socket?: { remoteAddress?: string } },
  ) {
    const fwd = req.headers['x-forwarded-for'];
    const ip =
      (typeof fwd === 'string' && fwd.split(',')[0].trim()) ||
      req.ip ||
      req.socket?.remoteAddress ||
      null;
    return this.identity.login(body.username, body.password, ip);
  }

  @Post('password-reset')
  requestReset(
    @Body() body: ResetPedidoDto,
    @Req() req: { ip?: string; headers: Record<string, unknown>; socket?: { remoteAddress?: string } },
  ) {
    const fwd = req.headers['x-forwarded-for'];
    const ip =
      (typeof fwd === 'string' && fwd.split(',')[0].trim()) ||
      req.ip ||
      req.socket?.remoteAddress ||
      null;
    return this.identity.requestPasswordReset(body.username, ip);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Req() req: { user: { userId: string } }) {
    return this.identity.me(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('password')
  changePassword(
    @Req() req: { user: { userId: string } },
    @Body() body: ChangeMyPasswordDto,
  ) {
    return this.identity.changePassword(req.user.userId, body.actual, body.password);
  }
}
