import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  AddCustomDomainDto,
  CreateSystemDomainDto,
  UpdateSystemDomainDto,
} from './dto/link-domain.dto';
import { LinkDomainsService } from './link-domains.service';

@ApiTags('link-domains')
@ApiBearerAuth()
@Controller('link-domains')
export class LinkDomainsController {
  constructor(private readonly domains: LinkDomainsService) {}

  /** Domain người dùng được chọn khi tạo link (theo gói) + domain riêng đã xác minh. */
  @Roles(Role.Admin, Role.User)
  @Get('available')
  async available(
    @CurrentUser() user: AuthUser,
  ): Promise<{ system: Record<string, unknown>[]; custom: Record<string, unknown>[] }> {
    const a = await this.domains.available(user);
    return {
      system: a.system.map((d) => d.toJSON()),
      custom: a.custom.map((d) => d.toJSON()),
    };
  }

  // ---- Domain riêng của người dùng ----

  @Roles(Role.Admin, Role.User)
  @Get('mine')
  async mine(@CurrentUser() user: AuthUser): Promise<Record<string, unknown>[]> {
    return (await this.domains.listMine(user)).map((d) => ({
      ...d.toJSON(),
      dns: d.status === 'active' ? null : this.domains.dnsInstructions(d),
    }));
  }

  @Roles(Role.Admin, Role.User)
  @Post('mine')
  addMine(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddCustomDomainDto,
  ): Promise<Record<string, unknown>> {
    return this.domains.addCustom(user, dto);
  }

  /** Kiểm tra bản ghi TXT rồi kích hoạt domain. */
  @Roles(Role.Admin, Role.User)
  @Post('mine/:id/verify')
  async verify(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return (await this.domains.verify(user, id)).toJSON();
  }

  @Roles(Role.Admin, Role.User)
  @Delete('mine/:id')
  removeMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.domains.removeMine(user, id);
  }

  // ---- Kho domain hệ thống (admin) ----

  @Roles(Role.Admin)
  @Get('system')
  async listSystem() {
    return (await this.domains.listSystem()).map((d) => d.toJSON());
  }

  @Roles(Role.Admin)
  @Post('system')
  async createSystem(@Body() dto: CreateSystemDomainDto) {
    return (await this.domains.createSystem(dto)).toJSON();
  }

  @Roles(Role.Admin)
  @Patch('system/:id')
  async updateSystem(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateSystemDomainDto,
  ) {
    return (await this.domains.updateSystem(id, dto)).toJSON();
  }

  /** Tắt domain hệ thống (không xóa hẳn để giữ lịch sử). */
  @Roles(Role.Admin)
  @Delete('system/:id')
  async disableSystem(@Param('id', ParseObjectIdPipe) id: string) {
    return (await this.domains.disableSystem(id)).toJSON();
  }
}
