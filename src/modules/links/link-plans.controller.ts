import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { LinkPlansService } from './link-plans.service';
import {
  AssignLinkPlanDto,
  CreateLinkPlanDto,
  UpdateLinkPlanDto,
} from './dto/link-plan.dto';

@ApiTags('link-plans')
@ApiBearerAuth()
@Controller('link-plans')
export class LinkPlansController {
  constructor(private readonly plans: LinkPlansService) {}

  /** Bảng gói đang bán (admin và người dùng đều xem được). */
  @Roles(Role.Admin, Role.User)
  @Get()
  async list() {
    return (await this.plans.listActive()).map((p) => p.toJSON());
  }

  @Roles(Role.Admin)
  @Get('admin/all')
  async listAll() {
    return (await this.plans.listAll()).map((p) => p.toJSON());
  }

  /** Người dùng nào đang dùng gói nào (chỉ những người được gán gói). */
  @Roles(Role.Admin)
  @Get('memberships')
  async memberships() {
    return (await this.plans.listMemberships()).map((m) => m.toJSON());
  }

  /** Gán gói cho người dùng, kèm ngày hết hạn tùy chọn. */
  @Roles(Role.Admin)
  @Put('assign')
  async assign(@Body() dto: AssignLinkPlanDto) {
    return (await this.plans.assign(dto)).toJSON();
  }

  @Roles(Role.Admin)
  @Post()
  async create(@Body() dto: CreateLinkPlanDto) {
    return (await this.plans.create(dto)).toJSON();
  }

  @Roles(Role.Admin)
  @Patch(':code')
  async update(@Param('code') code: string, @Body() dto: UpdateLinkPlanDto) {
    return (await this.plans.update(code.toLowerCase(), dto)).toJSON();
  }

  /** Ngừng bán gói (người đang dùng giữ đến khi hết hạn). */
  @Roles(Role.Admin)
  @Delete(':code')
  async deactivate(@Param('code') code: string) {
    return (await this.plans.deactivate(code.toLowerCase())).toJSON();
  }
}
