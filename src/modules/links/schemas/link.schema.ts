import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { jsonSchemaOptions } from '../../../common/mongoose-json';

/** Link rút gọn TikTok Shop (sản phẩm hoặc chiến dịch). */
@Schema({ ...jsonSchemaOptions, collection: 'links' })
export class Link {
  /** Mã trong đường dẫn /s/<code>. */
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true, enum: ['product', 'campaign', 'url'] })
  kind: 'product' | 'campaign' | 'url';

  /** URL web đầy đủ của TikTok (đã giải mã từ vt/vm). */
  @Prop({ required: true })
  webUrl: string;

  /** Deeplink snssdk1180://… để mở app (rỗng với link thường). */
  @Prop({ default: '' })
  appLink: string;

  @Prop({ default: '' })
  productId: string;

  @Prop({ default: '' })
  campaignId: string;

  /** Tên miền gắn với link; link chỉ mở được trên đúng domain này. Rỗng = mở trên domain bất kỳ của trang. */
  @Prop({ default: '', lowercase: true, trim: true })
  domain: string;

  /**
   * Hạn dùng của link tạo bằng gói Free (mặc định 3 ngày kể từ lúc tạo). `null` = không hết hạn (gói trả phí, admin hoặc đã nâng cấp);
   * không có trường này = link cũ, được gán hạn ở lần mở đầu tiên.
   */
  @Prop({ type: Date })
  expiresAt?: Date | null;

  @Prop({ default: '', trim: true })
  title: string;

  /** Link thường: `direct` = chuyển hướng ngay (HTTP 307), `interstitial` = trang trung gian có thẻ xem trước. */
  @Prop({ default: 'interstitial', enum: ['direct', 'interstitial'] })
  redirectType: 'direct' | 'interstitial';

  /** Ghi chú nội bộ để phân biệt link (không hiển thị cho người bấm). */
  @Prop({ default: '', trim: true })
  note: string;

  /** Mô tả hiển thị trong thẻ xem trước khi chia sẻ (link thường). */
  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ default: '' })
  image: string;

  /** Hash bcrypt của mật khẩu bảo vệ (rỗng = không có). Không bao giờ trả ra API (xem mongoose-json). */
  @Prop({ default: '' })
  passwordHash: string;

  /** Chuyển hướng theo quốc gia / tỉnh thành (link thường). */
  @Prop({ type: [Object], default: [] })
  geoRules: { country: string; region?: string; url: string }[];

  /** Chuyển hướng theo hệ điều hành thiết bị. */
  @Prop({ type: [Object], default: [] })
  deviceRules: { device: string; url: string }[];

  /** Chuyển hướng theo ngôn ngữ trình duyệt. */
  @Prop({ type: [Object], default: [] })
  langRules: { lang: string; url: string }[];

  /** Tham số (UTM…) tự gắn vào URL đích khi chuyển hướng. */
  @Prop({ type: [Object], default: [] })
  params: { key: string; value: string }[];

  /** Người tạo (id user). */
  @Prop({ required: true })
  ownerId: string;

  @Prop({ default: 0 })
  clicks: number;

  /** Lưu trữ: link ngừng hoạt động nhưng vẫn giữ trong danh sách lưu trữ và có thể khôi phục. */
  @Prop({ type: Date, default: null })
  archivedAt: Date | null;

  /** Xóa mềm: link đã xóa ngừng hoạt động nhưng vẫn tính vào hạn mức trong ngày. */
  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export type LinkDocument = HydratedDocument<Link>;
export const LinkSchema = SchemaFactory.createForClass(Link);
LinkSchema.virtual('hasPassword').get(function (this: { passwordHash?: string }) {
  return !!this.passwordHash;
});
LinkSchema.index({ createdAt: -1 });
LinkSchema.index({ ownerId: 1, createdAt: -1 });
