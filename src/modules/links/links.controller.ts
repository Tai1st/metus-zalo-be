import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LinkAdmin, LinkAuthGuard } from './link-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateLinkDto } from './dto/create-link.dto';
import { InspectLinkDto, UpdateLinkDto } from './dto/update-link.dto';
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
  list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.links.list(user, limit ? Number(limit) || 200 : 200, status === 'archived' ? 'archived' : 'active');
  }

  /** Kiểm tra một link TikTok (không lưu): loại link, URL đích, deeplink sinh ra. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('inspect')
  inspect(@Body() dto: InspectLinkDto) {
    return this.links.inspect(dto.url);
  }

  /** Đổi tiêu đề hoặc lưu trữ/khôi phục link. */
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateLinkDto,
  ) {
    return this.links.update(user, id, dto);
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
