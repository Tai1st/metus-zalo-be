import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import {
  Subscription,
  SubscriptionSchema,
} from '../subscriptions/schemas/subscription.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersInternalController } from './users-internal.controller';
import { CustomersController } from './customers.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [UsersController, UsersInternalController, CustomersController],
  providers: [UsersService],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
