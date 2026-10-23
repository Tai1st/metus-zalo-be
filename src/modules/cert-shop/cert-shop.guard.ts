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
import { Role } from '../../common/enums/role.enum';
import { UsersService } from '../users/users.service';

export const SESSION_COOKIE = 'cert_session';
const ADMIN_KEY = 'certShopAdmin';
/** Chỉ Role.Admin (cùng admin của Zalo) được gọi. */
export const CertAdmin = () => SetMetadata(ADMIN_KEY, true);

export type ShopUser = { id: string; username: string; role: Role };

export function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      return decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return undefined;
}

/**
 * Xác thực riêng cho shop. Dùng chung tài khoản (bảng users) với Zalo nhưng KHÔNG yêu cầu
 * gói Zalo còn hạn — khách mua chứng chỉ không có gói. Token vẫn bị API Zalo chặn bình thường
 * vì JwtStrategy của Zalo kiểm gói. Các route shop đều đánh dấu @Public() để bỏ qua guard Zalo.
 */
@Injectable()
export class CertShopGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: ShopUser }>();
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = bearer ?? readCookie(req.headers.cookie, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException('Chưa đăng nhập');

    let sub: string;
    try {
      sub = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub;
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
    // Đọc lại user để tài khoản bị khóa/xóa mất hiệu lực ngay.
    const user = await this.users.findById(sub);
    if (!user || !user.isActive || user.role === Role.Staff) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
    req.user = { id: String(user._id), username: user.username, role: user.role };

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
