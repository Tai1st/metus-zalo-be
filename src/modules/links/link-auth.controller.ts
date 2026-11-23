import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import * as bcrypt from 'bcryptjs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '../../common/enums/role.enum';
import { UsersService } from '../users/users.service';
import { LinkChangePasswordDto, LinkLoginDto, LinkRegisterDto } from './dto/link-auth.dto';
import { LinkAuthGuard } from './link-auth.guard';

// Dùng khi username không tồn tại để thời gian phản hồi không lộ tài khoản nào có thật.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

type Person = { _id: unknown; username: string; fullName: string; role: Role };
type View = { id: string; username: string; fullName: string; role: Role };

/**
 * Đăng ký / đăng nhập cho trang rút gọn link. Cùng bảng users với Zalo (một tài khoản dùng được nhiều dịch vụ)
 * nhưng không kiểm gói Zalo. Người đăng ký mới có vai trò shop (như khách shop chứng chỉ).
 */
@ApiTags('link-auth')
@Public()
@Controller('link-auth')
export class LinkAuthController {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: LinkRegisterDto) {
    // Bật mặc định; đặt LINKS_ALLOW_REGISTRATION=false để chỉ cấp tài khoản thủ công.
    if (this.config.get<string>('LINKS_ALLOW_REGISTRATION', 'true') === 'false') {
      throw new ForbiddenException('Đăng ký tài khoản đang tắt');
    }
    if (await this.users.findByUsername(dto.username)) {
      throw new ConflictException('Tên đăng nhập đã được sử dụng');
    }
    const user = await this.users.create({
      username: dto.username,
      password: dto.password,
      fullName: dto.fullName?.trim() || dto.username,
      role: Role.Shop,
      source: 'link',
    });
    return this.session(user);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LinkLoginDto) {
    const user = await this.users.findByUsername(dto.username, true);
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }
    if (!user.isActive) throw new ForbiddenException('Tài khoản đã bị khoá');
    if (user.role === Role.Staff) {
      throw new ForbiddenException('Tài khoản nhân sự không dùng được tính năng này');
    }
    return this.session(user);
  }

  // FE gọi ở mọi trang để biết ai đang đăng nhập nên không tính vào hạn mức tốc độ.
  @SkipThrottle()
  @ApiBearerAuth()
  @UseGuards(LinkAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<View | null> {
    const u = await this.users.findById(user.id);
    return u ? this.view(u) : null;
  }

  /** Đổi mật khẩu: bắt buộc nhập đúng mật khẩu hiện tại (chống người khác dùng phiên đang mở). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @UseGuards(LinkAuthGuard)
  @HttpCode(200)
  @Post('change-password')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: LinkChangePasswordDto) {
    const u = await this.users.findByIdWithPassword(user.id);
    if (!u) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    const ok = await bcrypt.compare(dto.currentPassword, u.passwordHash);
    if (!ok) throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    await this.users.setPassword(user.id, dto.newPassword);
    return { ok: true };
  }

  private view(u: Person): View {
    return { id: String(u._id), username: u.username, fullName: u.fullName, role: u.role };
  }

  private async session(u: Person) {
    const accessToken = await this.jwt.signAsync({ sub: String(u._id), role: u.role });
    return { accessToken, user: this.view(u) };
  }
}
