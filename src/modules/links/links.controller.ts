import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LinkAdmin, LinkAuthGuard } from './link-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateLinkDto } from './dto/create-link.dto';
import { LinksService } from './links.service';

/**
 * Link rút gọn TikTok Shop.
 * - Admin: tạo không giới hạn, xem và xóa mọi link.
 * - User: tạo trong hạn mức ngày, chỉ xem/xóa link của mình.
 */
@ApiTags('links')
@ApiBearerAuth()
@Public()
@UseGuards(LinkAuthGuard)
@Controller('links')
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLinkDto) {
    return this.links.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.links.list(user, limit ? Number(limit) || 200 : 200);
  }

  /** Hạn mức tạo link hôm nay: { limit, used, remaining } (admin: limit = null). */
  @Get('quota')
  quota(@CurrentUser() user: AuthUser) {
    return this.links.quota(user);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.links.remove(user, id);
  }
}
