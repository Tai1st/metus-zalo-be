import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthController } from './health/health.controller';
import { PlansModule } from './modules/plans/plans.module';
import { AddonsModule } from './modules/addons/addons.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { GroupModule } from './group/group.module';
import { ZaloAccountsModule } from './modules/zalo-accounts/zalo-accounts.module';
import { ChatModule } from './modules/chat/chat.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { LeadsModule } from './modules/leads/leads.module';
import { FriendRequestsModule } from './modules/friend-requests/friend-requests.module';
import { StatsModule } from './modules/stats/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    UsersModule,
    AuthModule,
    PlansModule,
    AddonsModule,
    SubscriptionsModule,
    GroupModule,
    ZaloAccountsModule,
    ChatModule,
    CampaignsModule,
    SchedulesModule,
    LeadsModule,
    FriendRequestsModule,
    StatsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit -> authenticate -> authorize by role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
