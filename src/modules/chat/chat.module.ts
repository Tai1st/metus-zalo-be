import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { ThreadName, ThreadNameSchema } from './schemas/thread-name.schema';
import {
  NotificationState,
  NotificationStateSchema,
} from './schemas/notification-state.schema';
import { ChatMessagesService } from './chat-messages.service';
import { ThreadNamesService } from './thread-names.service';
import { NotificationStateService } from './notification-state.service';
import { ChatInternalController } from './chat-internal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: ThreadName.name, schema: ThreadNameSchema },
      { name: NotificationState.name, schema: NotificationStateSchema },
    ]),
  ],
  controllers: [ChatInternalController],
  providers: [ChatMessagesService, ThreadNamesService, NotificationStateService],
})
export class ChatModule {}
