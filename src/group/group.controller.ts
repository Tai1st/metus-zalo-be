import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalKeyGuard } from '../common/internal-key.guard';
import { Public } from '../common/decorators/public.decorator';
import { GroupService } from './group.service';
import type { ZaloSession } from './zalo-session.service';

type Body_ = {
  session?: ZaloSession;
  link?: string;
  join?: boolean;
};

@Controller('internal')
@Public() // bỏ qua JwtAuthGuard toàn cục — được InternalKeyGuard bảo vệ riêng bên dưới
@UseGuards(InternalKeyGuard)
export class GroupController {
  constructor(private readonly groups: GroupService) {}

  /** Toàn bộ nhóm mà tài khoản đang tham gia — dùng cho ô chọn "Nhóm đích". */
  @Post('groups-mine')
  @HttpCode(200)
  async listMine(@Body() body: Body_) {
    const s = body.session;
    if (!s?.zaloId || !s.cookies || !s.imei || !s.userAgent) {
      throw new BadRequestException('Thiếu thông tin phiên Zalo');
    }
    return this.groups.listMine(s);
  }

  /** Thành viên của nhóm Zalo theo link mời. `session` do server Next gửi kèm. */
  @Post('group-link-members')
  @HttpCode(200)
  async linkMembers(@Body() body: Body_) {
    const s = body.session;
    const link = body.link?.trim();
    if (!link) throw new BadRequestException('Thiếu link nhóm');
    if (!s?.zaloId || !s.cookies || !s.imei || !s.userAgent) {
      throw new BadRequestException('Thiếu thông tin phiên Zalo');
    }
    return this.groups.linkMembers(s, link, body.join === true);
  }
}
