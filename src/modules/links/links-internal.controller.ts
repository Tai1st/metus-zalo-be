import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { InternalKeyGuard } from '../../common/internal-key.guard';
import { LinksService } from './links.service';

/**
 * Chỉ server Next (giữ INTERNAL_KEY) gọi. Trang /s/<code> do Next render ở server,
 * nên người xem và Facebook crawler không gọi thẳng backend.
 */
@Public()
@SkipThrottle()
@UseGuards(InternalKeyGuard)
@Controller('internal/links')
export class LinksInternalController {
  constructor(private readonly links: LinksService) {}

  /** `count=1` -> tăng lượt bấm (Next chỉ bật khi không phải bot quét link); `host` = domain đang truy cập để đối chiếu. */
  @Get(':code')
  resolve(
    @Param('code') code: string,
    @Query('count') count?: string,
    @Query('host') host?: string,
  ) {
    return this.links.resolve(code, count === '1', host);
  }
}
