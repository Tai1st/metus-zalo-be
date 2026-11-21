import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LinkAdmin, LinkAuthGuard } from './link-auth.guard';
import { LinkPlansService } from './link-plans.service';
import {
  AssignLinkPlanDto,
  CreateLinkPlanDto,
  UpdateLinkPlanDto,
} from './dto/link-plan.dto';

@ApiTags('link-plans')
@ApiBearerAuth()
@Public()
@UseGuards(LinkAuthGuard)
@Controller('link-plans')
export class LinkPlansController {
  constructor(private readonly plans: LinkPlansService) {}

  /** Bảng gói đang bán (admin và người dùng đều xem được). */
  @Get()
  async list() {
    return (await this.plans.listActive()).map((p) => p.toJSON());
  }

  @LinkAdmin()
  @Get('admin/all')
  async listAll() {
    return (await this.plans.listAll()).map((p) => p.toJSON());
  }

  /** Người dùng nào đang dùng gói nào (chỉ những người được gán gói). */
  @LinkAdmin()
  @Get('memberships')
  async memberships() {
    return (await this.plans.listMemberships()).map((m) => m.toJSON());
  }

  /** Gán gói cho người dùng, kèm ngày hết hạn tùy chọn. */
  @LinkAdmin()
  @Put('assign')
  async assign(@Body() dto: AssignLinkPlanDto) {
    return (await this.plans.assign(dto)).toJSON();
  }

  @LinkAdmin()
  @Post()
  async create(@Body() dto: CreateLinkPlanDto) {
    return (await this.plans.create(dto)).toJSON();
  }

  @LinkAdmin()
  @Patch(':code')
  async update(@Param('code') code: string, @Body() dto: UpdateLinkPlanDto) {
    return (await this.plans.update(code.toLowerCase(), dto)).toJSON();
  }

  /** Ngừng bán gói (người đang dùng giữ đến khi hết hạn). */
  @LinkAdmin()
  @Delete(':code')
  async deactivate(@Param('code') code: string) {
    return (await this.plans.deactivate(code.toLowerCase())).toJSON();
  }
}
