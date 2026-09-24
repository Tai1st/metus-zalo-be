import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export type AuthUser = {
  id: string;
  username: string;
  role: Role;
  /** Zalo account ids this user may use — meaningless for Role.Admin (full access). */
  allowedZaloIds: string[];
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
