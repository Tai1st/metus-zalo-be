import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [UsersModule, SubscriptionsModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
