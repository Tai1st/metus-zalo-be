import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export interface UsdtNetworkConfig {
  /** Khóa nội bộ cố định, vd 'bep20' | 'ton' | 'arbitrum' | 'polygon' | 'trc20'. */
  key: string;
  label: string;
  /** Mã mạng CHÍNH XÁC Binance trả về (deposit/hisrec, config/getall) — admin tự xác minh, không đoán. */
  binanceNetwork: string;
  address: string;
  feeMicro: number;
  enabled: boolean;
}

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

  // ---- nạp USDT qua Binance (nhiều mạng) ----
  @Prop() binanceApiKeyEnc?: string;
  @Prop() binanceApiSecretEnc?: string;
  /** @deprecated đã thay bằng usdtNetworks, giữ lại chỉ để migrate dữ liệu cũ. */
  @Prop() binanceBepAddress?: string;
  /** @deprecated đã thay bằng usdtNetworks[].feeMicro. */
  @Prop() depositServiceFeeMicro?: number;
  /**
   * Danh sách mạng nhận USDT admin đã cấu hình (địa chỉ + mã mạng Binance + phí + bật/tắt). Mỗi mạng
   * chỉ bật khi admin đã xác minh binanceNetwork khớp với tài khoản Binance thật — không suy đoán.
   */
  @Prop({ type: [Object], default: undefined }) usdtNetworks?: UsdtNetworkConfig[];
  @Prop() depositMinMicro?: number;
  @Prop() depositMaxMicro?: number;
  /** Tỷ giá quy đổi 1 USDT ra VND khi cộng ví — admin tự cập nhật định kỳ, không tra API ngoài. */
  @Prop() usdtVndRate?: number;
}

export type CertSettingDocument = HydratedDocument<CertSetting>;
export const CertSettingSchema = SchemaFactory.createForClass(CertSetting);
