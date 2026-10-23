import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { CertAdminController } from './cert-admin.controller';
import { CertAuthController } from './cert-auth.controller';
import { CertAppService } from './cert-app.service';
import { CertCheckService } from './cert-check.service';
import { CertOrdersService } from './cert-orders.service';
import { CertSettingsService } from './cert-settings.service';
import { CertShopController } from './cert-shop.controller';
import { CertSignController } from './cert-sign.controller';
import { CertSignService } from './cert-sign.service';
import { CertShopGuard } from './cert-shop.guard';
import { ChungchiClient } from './chungchi.client';
import { CertEnroll, CertEnrollSchema } from './schemas/cert-enroll.schema';
import { CertOrder, CertOrderSchema } from './schemas/cert-order.schema';
import { CertSetting, CertSettingSchema } from './schemas/cert-setting.schema';

/** Shop bán chứng chỉ iOS. Dùng chung users với Zalo; dữ liệu riêng nằm ở các collection cert_*. */
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: CertOrder.name, schema: CertOrderSchema },
      { name: CertEnroll.name, schema: CertEnrollSchema },
      { name: CertSetting.name, schema: CertSettingSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') as never,
        },
      }),
    }),
  ],
  controllers: [CertAuthController, CertShopController, CertSignController, CertAdminController],
  providers: [ChungchiClient, CertAppService, CertCheckService, CertSignService, CertOrdersService, CertSettingsService, CertShopGuard],
})
export class CertShopModule {}
