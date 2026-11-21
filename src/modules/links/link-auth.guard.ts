import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { UsersService } from '../users/users.service';

const ADMIN_KEY = 'linkAdmin';
/** Chỉ Role.Admin được gọi route này. */
export const LinkAdmin = () => SetMetadata(ADMIN_KEY, true);

/**
 * Xác thực riêng cho tính năng link rút gọn. Dùng chung bảng users với Zalo nhưng KHÔNG đòi gói Zalo
 * còn hạn: người đăng ký chỉ để rút gọn link không có gói Zalo. Token này vẫn bị API Zalo chặn bình thường
 * vì JwtStrategy của Zalo kiểm gói. Các route link đều đánh dấu @Public() để bỏ qua guard Zalo.
 */
@Injectable()
export class LinkAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Chưa đăng nhập');
    }

    let sub: string;
    try {
      sub = (await this.jwt.verifyAsync<{ sub: string }>(header.slice(7))).sub;
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
    // Đọc lại user để tài khoản bị khóa/xóa mất hiệu lực ngay.
    const user = await this.users.findById(sub);
    if (!user || !user.isActive || user.role === Role.Staff) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
    req.user = {
      id: String(user._id),
      username: user.username,
      role: user.role,
      allowedZaloIds: [],
    };

    const needAdmin = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (needAdmin && user.role !== Role.Admin) {
      throw new ForbiddenException('Không có quyền');
    }
    return true;
  }
}
