import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { InternalKeyGuard } from '../../common/internal-key.guard';
import { LinkAuthGuard } from './link-auth.guard';
import { LinkBiosService } from './link-bios.service';
import { SaveBioDto } from './dto/link-bio.dto';

/** Trang Bio của người dùng đăng nhập. */
@ApiTags('link-bios')
@ApiBearerAuth()
@Public()
@UseGuards(LinkAuthGuard)
@Controller('link-bios')
export class LinkBiosController {
  constructor(private readonly bios: LinkBiosService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.bios.getMine(user);
  }

  @Put('mine')
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveBioDto) {
    return this.bios.saveMine(user, dto);
  }
}

/** Chỉ server Next (giữ INTERNAL_KEY) gọi để dựng trang công khai /bio/<slug>. */
@Public()
@SkipThrottle()
@UseGuards(InternalKeyGuard)
@Controller('internal/bios')
export class LinkBiosInternalController {
  constructor(private readonly bios: LinkBiosService) {}

  @Get(':slug')
  resolve(@Param('slug') slug: string, @Query('count') count?: string) {
    return this.bios.publicBySlug(slug, count === '1');
  }
}
