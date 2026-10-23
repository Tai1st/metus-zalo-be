import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import * as bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '../../common/enums/role.enum';
import { UsersService } from '../users/users.service';
import { ShopLoginDto, ShopRegisterDto } from './dto/cert-shop.dto';
import { CertShopGuard, SESSION_COOKIE, ShopUser } from './cert-shop.guard';

// Dùng khi username không tồn tại để thời gian phản hồi không lộ tài khoản nào có thật.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Đăng nhập/đăng ký của shop: dùng chung bảng users với Zalo (cùng tài khoản, cùng mật khẩu)
 * nhưng không kiểm gói Zalo. Admin của Zalo cũng là admin shop.
 */
@Public()
@Controller('cert-shop/auth')
export class CertAuthController {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: ShopRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (await this.users.findByUsername(dto.username)) {
      throw new ConflictException('Tên đăng nhập đã được sử dụng');
    }
    const user = await this.users.create({
      username: dto.username,
      password: dto.password,
      fullName: dto.fullName?.trim() || dto.username,
      role: Role.Shop,
    });
    await this.startSession(res, String(user._id), user.role);
    return this.view(user);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: ShopLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.users.findByUsername(dto.username, true);
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }
    if (!user.isActive) throw new ForbiddenException('Tài khoản đã bị khoá');
    if (user.role === Role.Staff) {
      throw new ForbiddenException('Tài khoản nhân sự không dùng được shop');
    }
    await this.startSession(res, String(user._id), user.role);
    return this.view(user);
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  // FE gọi ở mọi trang để biết ai đang đăng nhập nên không tính vào hạn mức tốc độ.
  @SkipThrottle()
  @UseGuards(CertShopGuard)
  @Get('me')
  async me(@Req() req: Request & { user: ShopUser }) {
    const user = await this.users.findById(req.user.id);
    return user ? this.view(user) : null;
  }

  private view(u: { _id: unknown; username: string; fullName: string; role: Role }) {
    return {
      id: String(u._id),
      username: u.username,
      fullName: u.fullName,
      isAdmin: u.role === Role.Admin,
    };
  }

  private async startSession(res: Response, userId: string, role: Role) {
    const token = await this.jwt.signAsync({ sub: userId, role });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/',
      maxAge: MAX_AGE_MS,
    });
  }
}
