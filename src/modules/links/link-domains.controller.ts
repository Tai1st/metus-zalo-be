import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LinkAdmin, LinkAuthGuard } from './link-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  AddCustomDomainDto,
  CreateSystemDomainDto,
  UpdateSystemDomainDto,
} from './dto/link-domain.dto';
import { LinkDomainsService } from './link-domains.service';

@ApiTags('link-domains')
@ApiBearerAuth()
@Public()
@UseGuards(LinkAuthGuard)
@Controller('link-domains')
export class LinkDomainsController {
  constructor(private readonly domains: LinkDomainsService) {}

  /** Domain người dùng được chọn khi tạo link (theo gói) + domain riêng đã xác minh. */
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

  @Get('mine')
  async mine(@CurrentUser() user: AuthUser): Promise<Record<string, unknown>[]> {
    return (await this.domains.listMine(user)).map((d) => ({
      ...d.toJSON(),
      dns: d.status === 'active' ? null : this.domains.dnsInstructions(d),
    }));
  }

  @Post('mine')
  addMine(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddCustomDomainDto,
  ): Promise<Record<string, unknown>> {
    return this.domains.addCustom(user, dto);
  }

  /** Kiểm tra bản ghi TXT rồi kích hoạt domain. */
  @Post('mine/:id/verify')
  async verify(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return (await this.domains.verify(user, id)).toJSON();
  }

  @Delete('mine/:id')
  removeMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.domains.removeMine(user, id);
  }

  // ---- Tên miền riêng của mọi người dùng (admin) ----

  @LinkAdmin()
  @Get('custom')
  listCustom(): Promise<Record<string, unknown>[]> {
    return this.domains.listCustomAdmin();
  }

  @LinkAdmin()
  @Patch('custom/:id')
  async setCustomActive(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateSystemDomainDto,
  ) {
    return (await this.domains.setCustomActive(id, dto.isActive !== false)).toJSON();
  }

  @LinkAdmin()
  @Post('custom/:id/verify')
  async verifyCustom(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return (await this.domains.verify(user, id)).toJSON();
  }

  @LinkAdmin()
  @Delete('custom/:id')
  removeCustom(@Param('id', ParseObjectIdPipe) id: string) {
    return this.domains.removeCustomAdmin(id);
  }

  // ---- Kho domain hệ thống (admin) ----

  @LinkAdmin()
  @Get('system')
  async listSystem() {
    return (await this.domains.listSystem()).map((d) => d.toJSON());
  }

  @LinkAdmin()
  @Post('system')
  async createSystem(@Body() dto: CreateSystemDomainDto) {
    return (await this.domains.createSystem(dto)).toJSON();
  }

  @LinkAdmin()
  @Patch('system/:id')
  async updateSystem(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateSystemDomainDto,
  ) {
    return (await this.domains.updateSystem(id, dto)).toJSON();
  }

  /** Tắt domain hệ thống (không xóa hẳn để giữ lịch sử). */
  @LinkAdmin()
  @Delete('system/:id')
  async disableSystem(@Param('id', ParseObjectIdPipe) id: string) {
    return (await this.domains.disableSystem(id)).toJSON();
  }
}
