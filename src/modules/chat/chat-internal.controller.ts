import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { InternalKeyGuard } from '../../common/internal-key.guard';
import { ChatMessagesService } from './chat-messages.service';
import { ThreadNamesService } from './thread-names.service';
import { NotificationStateService } from './notification-state.service';
import { PersistMessageDto } from './dto/persist-message.dto';
import { UpsertThreadNamesDto } from './dto/thread-names.dto';

/** Reachable only by the Next server — see zalo-internal.controller.ts for
 * the auth story (Public + InternalKeyGuard). */
@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/chat')
export class ChatInternalController {
  constructor(
    private readonly messages: ChatMessagesService,
    private readonly threadNames: ThreadNamesService,
    private readonly notificationState: NotificationStateService,
  ) {}

  // ---- messages ----

  @Post('messages')
  persist(@Body() dto: PersistMessageDto) {
    return this.messages
      .persist(dto.zaloId, {
        id: dto.id,
        threadId: dto.threadId,
        threadType: dto.threadType,
        isSelf: dto.isSelf,
        fromId: dto.fromId ?? '',
        fromName: dto.fromName ?? '',
        content: dto.content ?? '',
        ts: dto.ts,
        attachment: dto.attachment,
        stickerId: dto.stickerId,
        systemLabel: dto.systemLabel,
      })
      .then(() => ({ ok: true }));
  }

  @Get('messages/thread')
  threadMessages(
    @Query('zaloId') zaloId: string,
    @Query('threadId') threadId: string,
  ) {
    return this.messages.threadMessages(zaloId, threadId);
  }

  @Get('messages/recent')
  recent(@Query('zaloId') zaloId: string, @Query('limit') limit?: string) {
    return this.messages.recent(zaloId, Number(limit) || 30);
  }

  @Get('messages/last-timestamps')
  lastTimestamps(@Query('zaloId') zaloId: string) {
    return this.messages.lastMessageTimestamps(zaloId);
  }

  @Get('messages/last-previews')
  lastPreviews(@Query('zaloId') zaloId: string) {
    return this.messages.lastMessagePreviews(zaloId);
  }

  @Get('messages/unread-count')
  unreadCount(@Query('zaloId') zaloId: string, @Query('since') since: string) {
    return this.messages
      .unreadCountSince(zaloId, Number(since) || 0)
      .then((count) => ({ count }));
  }

  // ---- thread names ----

  @Post('thread-names')
  upsertThreadNames(@Body() dto: UpsertThreadNamesDto) {
    return this.threadNames
      .upsertMany(dto.zaloId, dto.threads)
      .then(() => ({ ok: true }));
  }

  @Get('thread-names/one')
  getThreadName(
    @Query('zaloId') zaloId: string,
    @Query('threadId') threadId: string,
  ) {
    return this.threadNames.get(zaloId, threadId).then((name) => ({ name }));
  }

  // ---- notification state ----

  @Get('notification-state')
  getNotificationState(@Query('userId') userId: string) {
    return this.notificationState
      .getLastReadAt(userId)
      .then((lastReadAt) => ({ lastReadAt }));
  }

  @Patch('notification-state/read')
  markRead(@Query('userId') userId: string) {
    return this.notificationState
      .markAllRead(userId)
      .then((lastReadAt) => ({ lastReadAt }));
  }
}
