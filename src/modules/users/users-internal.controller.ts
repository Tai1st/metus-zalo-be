import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { InternalKeyGuard } from '../../common/internal-key.guard';
import { UsersService } from './users.service';

/**
 * Reachable only by the Next server (shared `x-internal-key`), for cases
 * where the caller isn't holding the target user's own JWT — e.g. the
 * background QR-login flow granting the newly-linked Zalo account to
 * whichever user started that scan.
 */
@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/users')
export class UsersInternalController {
  constructor(private readonly users: UsersService) {}

  @Post(':id/zalo-ids')
  async grantZaloId(@Param('id') id: string, @Body('zaloId') zaloId: string) {
    await this.users.addOwnZaloId(id, zaloId);
    return { ok: true };
  }
}
