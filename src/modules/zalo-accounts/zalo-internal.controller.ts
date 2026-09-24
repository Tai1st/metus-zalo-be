import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { InternalKeyGuard } from '../../common/internal-key.guard';
import { ZaloAccountsService } from './zalo-accounts.service';
import { ZaloProxiesService } from './zalo-proxies.service';
import { AccountLabelsService } from './account-labels.service';
import { ChatLabelsService } from './chat-labels.service';
import { UpsertAccountDto } from './dto/upsert-account.dto';
import { ProfileUpdateDto } from './dto/profile-update.dto';
import { ProxyBodyDto } from './dto/proxy-body.dto';
import { LabelIdsDto } from './dto/label-ids.dto';
import { CreateLabelDto, UpdateLabelDto } from './dto/label-body.dto';
import { ProxyInputDto } from './dto/proxy-input.dto';

/**
 * Everything here is reachable only by the Next server (never the browser):
 * `@Public()` skips the global JWT guard, `InternalKeyGuard` then requires
 * the shared `x-internal-key` header (Next's ZALO_BE_KEY / this service's
 * INTERNAL_KEY). Cookie sessions only ever cross this boundary, never one
 * further out.
 */
@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/zalo')
export class ZaloInternalController {
  constructor(
    private readonly accounts: ZaloAccountsService,
    private readonly proxies: ZaloProxiesService,
    private readonly accountLabels: AccountLabelsService,
    private readonly chatLabels: ChatLabelsService,
  ) {}

  // ---- accounts ----

  @Get('accounts')
  listAccounts() {
    return this.accounts.list();
  }

  @Get('accounts/active-sessions')
  activeSessions() {
    return this.accounts.listActiveSessions();
  }

  @Get('accounts/:zaloId')
  getAccount(@Param('zaloId') zaloId: string) {
    return this.accounts.get(zaloId);
  }

  @Get('accounts/:zaloId/session')
  getSession(@Param('zaloId') zaloId: string) {
    return this.accounts.getSession(zaloId);
  }

  @Post('accounts')
  upsertAccount(@Body() dto: UpsertAccountDto) {
    return this.accounts.upsert(dto).then(() => ({ zaloId: dto.zaloId }));
  }

  @Delete('accounts/:zaloId')
  removeAccount(@Param('zaloId') zaloId: string) {
    return this.accounts.remove(zaloId).then(() => ({ removed: zaloId }));
  }

  @Patch('accounts/:zaloId/touch-last-seen')
  touchLastSeen(@Param('zaloId') zaloId: string) {
    return this.accounts.touchLastSeen(zaloId).then(() => ({ ok: true }));
  }

  @Patch('accounts/:zaloId/profile')
  updateProfile(
    @Param('zaloId') zaloId: string,
    @Body() dto: ProfileUpdateDto,
  ) {
    return this.accounts.updateProfile(zaloId, dto).then(() => ({ ok: true }));
  }

  @Patch('accounts/:zaloId/proxy')
  setProxy(@Param('zaloId') zaloId: string, @Body() dto: ProxyBodyDto) {
    return this.accounts
      .setProxy(zaloId, dto.proxyId ?? null)
      .then(() => ({ zaloId, proxyId: dto.proxyId ?? null }));
  }

  @Get('accounts/:zaloId/labels')
  getAccountLabels(@Param('zaloId') zaloId: string) {
    return this.accounts.getLabelIds(zaloId);
  }

  @Put('accounts/:zaloId/labels')
  setAccountLabels(@Param('zaloId') zaloId: string, @Body() dto: LabelIdsDto) {
    return this.accounts
      .setLabelIds(zaloId, dto.labelIds)
      .then(() => ({ zaloId, labelIds: dto.labelIds }));
  }

  @Get('account-label-map')
  labelIdsByAccount() {
    return this.accounts.labelIdsByAccount();
  }

  // ---- proxies ----

  @Get('proxies')
  listProxies() {
    return this.proxies.list();
  }

  @Post('proxies')
  createProxy(@Body() dto: ProxyInputDto) {
    return this.proxies.create(dto);
  }

  @Put('proxies/:id')
  updateProxy(@Param('id') id: string, @Body() dto: ProxyInputDto) {
    return this.proxies.update(Number(id), dto);
  }

  @Delete('proxies/:id')
  deleteProxy(@Param('id') id: string) {
    return this.proxies
      .remove(Number(id))
      .then(() => ({ removed: Number(id) }));
  }

  // ---- account labels ----

  @Get('account-labels')
  listAccountLabels() {
    return this.accountLabels.list();
  }

  @Post('account-labels')
  createAccountLabel(@Body() dto: CreateLabelDto) {
    return this.accountLabels.create(dto);
  }

  @Patch('account-labels/:id')
  updateAccountLabel(@Param('id') id: string, @Body() dto: UpdateLabelDto) {
    return this.accountLabels
      .update(Number(id), dto)
      .then(() => ({ updated: Number(id) }));
  }

  @Delete('account-labels/:id')
  deleteAccountLabel(@Param('id') id: string) {
    return this.accountLabels
      .remove(Number(id))
      .then(() => ({ removed: Number(id) }));
  }

  // ---- chat labels ----

  @Get('chat-labels')
  listChatLabels() {
    return this.chatLabels.list();
  }

  @Post('chat-labels')
  createChatLabel(@Body() dto: CreateLabelDto) {
    return this.chatLabels.create(dto);
  }

  @Patch('chat-labels/:id')
  updateChatLabel(@Param('id') id: string, @Body() dto: UpdateLabelDto) {
    return this.chatLabels
      .update(Number(id), dto)
      .then(() => ({ updated: Number(id) }));
  }

  @Delete('chat-labels/:id')
  deleteChatLabel(@Param('id') id: string) {
    return this.chatLabels
      .remove(Number(id))
      .then(() => ({ removed: Number(id) }));
  }

  @Get('chat-label-assignments')
  getThreadLabels(
    @Query('accountId') accountId?: string,
    @Query('threadId') threadId?: string,
  ) {
    if (!accountId || !threadId) {
      throw new NotFoundException('Thiếu accountId hoặc threadId');
    }
    return this.chatLabels.getThreadLabelIds(accountId, threadId);
  }

  @Put('chat-label-assignments')
  setThreadLabels(
    @Query('accountId') accountId: string | undefined,
    @Query('threadId') threadId: string | undefined,
    @Body() dto: LabelIdsDto,
  ) {
    if (!accountId || !threadId) {
      throw new NotFoundException('Thiếu accountId hoặc threadId');
    }
    return this.chatLabels
      .setThreadLabels(accountId, threadId, dto.labelIds)
      .then(() => ({ labelIds: dto.labelIds }));
  }

  @Get('chat-label-assignments/by-account')
  threadLabelsForAccount(@Query('accountId') accountId?: string) {
    if (!accountId) throw new NotFoundException('Thiếu accountId');
    return this.chatLabels.threadLabelsForAccount(accountId);
  }
}
