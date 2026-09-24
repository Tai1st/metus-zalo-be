import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from '../../common/counter.schema';
import { CounterService } from '../../common/counter.service';
import {
  FriendRequest,
  FriendRequestSchema,
} from './schemas/friend-request.schema';
import { FriendRequestsService } from './friend-requests.service';
import { FriendRequestsInternalController } from './friend-requests-internal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Counter.name, schema: CounterSchema },
      { name: FriendRequest.name, schema: FriendRequestSchema },
    ]),
  ],
  controllers: [FriendRequestsInternalController],
  providers: [CounterService, FriendRequestsService],
})
export class FriendRequestsModule {}
