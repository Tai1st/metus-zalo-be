import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { AddonsModule } from '../addons/addons.module';
import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [
    PlansModule,
    UsersModule,
    AddonsModule,
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
