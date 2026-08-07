import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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

@Controller('auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.identity.login(body.username, body.password);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Req() req: { user: { userId: string } }) {
    return this.identity.me(req.user.userId);
  }
}
