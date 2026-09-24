import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

// Compared against when the username is unknown, so response time does not
// reveal which usernames exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // Off by default: accounts are handed out by the operator, not self-served.
    if (this.config.get<string>('ALLOW_REGISTRATION') !== 'true') {
      throw new ForbiddenException('Đăng ký tài khoản đang tắt');
    }
    if (await this.users.findByUsername(dto.username)) {
      throw new ConflictException('Tên đăng nhập đã được sử dụng');
    }
    const user = await this.users.create(dto);
    return this.session(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByUsername(dto.username, true);
    const ok = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !ok) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }
    if (!user.isActive) {
      throw new ForbiddenException('Tài khoản đã bị khoá');
    }
    return this.session(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.users.findByIdWithPassword(userId);
    if (!user) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    await this.users.setPassword(userId, dto.newPassword);
  }

  private async session(user: UserDocument) {
    const accessToken = await this.jwt.signAsync({
      sub: String(user._id),
      role: user.role,
    });
    return { accessToken, user: user.toJSON() };
  }
}
