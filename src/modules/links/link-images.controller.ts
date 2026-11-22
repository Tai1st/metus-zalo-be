import { Body, Controller, Get, Header, Param, Post, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { LinkAuthGuard } from './link-auth.guard';
import { LinkImagesService } from './link-images.service';
import { BannerUploadDto } from './dto/link-extras.dto';

@ApiTags('links')
@Public()
@Controller()
export class LinkImagesController {
  constructor(private readonly images: LinkImagesService) {}

  /** Tải banner (PNG/JPEG ≤ 500KB, gửi base64). Trả về đường dẫn https công khai để gắn vào link. */
  @UseGuards(LinkAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('links/banner')
  upload(@CurrentUser() user: AuthUser, @Body() dto: BannerUploadDto) {
    return this.images.upload(user.id, dto.data);
  }

  /** Công khai để Facebook/Zalo… tải ảnh xem trước. */
  @SkipThrottle()
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'")
  @Get('public/link-images/:id')
  async get(@Param('id', ParseObjectIdPipe) id: string, @Res() res: Response) {
    const img = await this.images.get(id);
    res.setHeader('Content-Type', img.mime);
    res.send(img.data);
  }
}
