import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { CertShopModule } from '../cert-shop/cert-shop.module';
import { Link, LinkSchema } from './schemas/link.schema';
import { LinkPlan, LinkPlanSchema } from './schemas/link-plan.schema';
import {
  LinkMembership,
  LinkMembershipSchema,
} from './schemas/link-membership.schema';
import { LinkOrder, LinkOrderSchema } from './schemas/link-order.schema';
import { LinkDomain, LinkDomainSchema } from './schemas/link-domain.schema';
import { LinksService } from './links.service';
import { LinkPlansService } from './link-plans.service';
import { LinkOrdersService } from './link-orders.service';
import { LinkDomainsService } from './link-domains.service';
import { LinkPaymentWatcherService } from './link-payment-watcher.service';
import { LinksController } from './links.controller';
import { LinkPlansController } from './link-plans.controller';
import { LinkOrdersController } from './link-orders.controller';
import { LinkDomainsController } from './link-domains.controller';
import { LinksInternalController } from './links-internal.controller';
import { LinkAuthController } from './link-auth.controller';
import { LinkAuthGuard } from './link-auth.guard';

@Module({
  imports: [
    UsersModule,
    CertShopModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') as never,
        },
      }),
    }),
    MongooseModule.forFeature([
      { name: Link.name, schema: LinkSchema },
      { name: LinkPlan.name, schema: LinkPlanSchema },
      { name: LinkMembership.name, schema: LinkMembershipSchema },
      { name: LinkOrder.name, schema: LinkOrderSchema },
      { name: LinkDomain.name, schema: LinkDomainSchema },
    ]),
  ],
  controllers: [
    LinkAuthController,
    LinksController,
    LinkPlansController,
    LinkOrdersController,
    LinkDomainsController,
    LinksInternalController,
  ],
  providers: [
    LinksService,
    LinkPlansService,
    LinkOrdersService,
    LinkDomainsService,
    LinkPaymentWatcherService,
    LinkAuthGuard,
  ],
})
export class LinksModule {}
