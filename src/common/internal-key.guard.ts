import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/** Chỉ server Next (giữ INTERNAL_KEY) được gọi các route /internal/*. */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTERNAL_KEY');
    if (!expected)
      throw new UnauthorizedException('BE chưa cấu hình INTERNAL_KEY');
    const req = ctx.switchToHttp().getRequest<Request>();
    const got = String(req.headers['x-internal-key'] ?? '');
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
