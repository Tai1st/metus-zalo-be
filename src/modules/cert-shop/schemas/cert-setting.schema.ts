import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Cấu hình shop, một document duy nhất (key = 'main'). Trường trống thì dùng env/mặc định. */
@Schema({ collection: 'cert_settings', timestamps: true })
export class CertSetting {
  @Prop({ required: true, unique: true, default: 'main' }) key: string;

  /** Địa chỉ FE shop (dùng cho link profile UDID và chuyển hướng 301). */
  @Prop() siteUrl?: string;

  @Prop() bankId?: string;
  @Prop() bankAccountNo?: string;
  @Prop() bankAccountName?: string;

  /** Giá bán = giá gốc * hệ số, làm tròn lên tới priceRoundTo. */
  @Prop() priceMarkup?: number;
  @Prop() priceRoundTo?: number;

  @Prop() chungchiBaseUrl?: string;
  /** Mã hóa AES-256-GCM bằng COOKIE_SECRET, không bao giờ trả ra ngoài. */
  @Prop() chungchiApiKeyEnc?: string;
  @Prop() webhookSecretEnc?: string;
}

export type CertSettingDocument = HydratedDocument<CertSetting>;
export const CertSettingSchema = SchemaFactory.createForClass(CertSetting);
