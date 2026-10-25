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

  /** Các dòng mô tả quyền lợi hiển thị trên thẻ gói (API nhà cung cấp không có mô tả). */
  @Prop({ type: [String], default: undefined }) planFeatures?: string[];

  /** App phát hành cho khách đã mua chứng chỉ: tên file nằm trong thư mục lưu trữ của BE. */
  @Prop() appFile?: string;
  @Prop() appName?: string;
  @Prop() appVersion?: string;
  @Prop() appBundleId?: string;
  @Prop() appMinOs?: string;

  @Prop() chungchiBaseUrl?: string;
  /** Mã hóa AES-256-GCM bằng COOKIE_SECRET, không bao giờ trả ra ngoài. */
  @Prop() chungchiApiKeyEnc?: string;
  @Prop() webhookSecretEnc?: string;

  /** Token API web2m.com (lịch sử giao dịch ACB) dùng để tự động xác nhận thanh toán. */
  @Prop() web2mTokenEnc?: string;
}

export type CertSettingDocument = HydratedDocument<CertSetting>;
export const CertSettingSchema = SchemaFactory.createForClass(CertSetting);
