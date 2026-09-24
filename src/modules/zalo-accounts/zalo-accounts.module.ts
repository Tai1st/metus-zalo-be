import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from '../../common/counter.schema';
import { CounterService } from '../../common/counter.service';
import { ZaloAccount, ZaloAccountSchema } from './schemas/zalo-account.schema';
import { ZaloProxy, ZaloProxySchema } from './schemas/zalo-proxy.schema';
import {
  AccountLabel,
  AccountLabelSchema,
} from './schemas/account-label.schema';
import { ChatLabel, ChatLabelSchema } from './schemas/chat-label.schema';
import {
  ChatLabelAssignment,
  ChatLabelAssignmentSchema,
} from './schemas/chat-label-assignment.schema';
import { ZaloAccountsService } from './zalo-accounts.service';
import { ZaloProxiesService } from './zalo-proxies.service';
import { AccountLabelsService } from './account-labels.service';
import { ChatLabelsService } from './chat-labels.service';
import { ZaloInternalController } from './zalo-internal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Counter.name, schema: CounterSchema },
      { name: ZaloAccount.name, schema: ZaloAccountSchema },
      { name: ZaloProxy.name, schema: ZaloProxySchema },
      { name: AccountLabel.name, schema: AccountLabelSchema },
      { name: ChatLabel.name, schema: ChatLabelSchema },
      { name: ChatLabelAssignment.name, schema: ChatLabelAssignmentSchema },
    ]),
  ],
  controllers: [ZaloInternalController],
  providers: [
    CounterService,
    ZaloAccountsService,
    ZaloProxiesService,
    AccountLabelsService,
    ChatLabelsService,
  ],
})
export class ZaloAccountsModule {}
