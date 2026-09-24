import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /** Re-read the user so a deleted / locked account stops working at once. */
  async validate(payload: { sub: string }): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
    if (!(await this.users.planAccessOk(user))) {
      throw new UnauthorizedException('Gói dịch vụ đã hết hạn');
    }
    return {
      id: String(user._id),
      username: user.username,
      role: user.role,
      allowedZaloIds: user.allowedZaloIds,
    };
  }
}
