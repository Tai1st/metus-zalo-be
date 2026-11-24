import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { jsonSchemaOptions } from '../../../common/mongoose-json';

export type LinkPeriod = 'day' | 'week' | 'month';

@Schema({ _id: false })
export class LinkPlanPrice {
  @Prop({ required: true, min: 1 })
  months: number;

  @Prop({ required: true, min: 0 })
  price: number;
}
export const LinkPlanPriceSchema = SchemaFactory.createForClass(LinkPlanPrice);

/** Gói tạo link rút gọn: hạn mức số link trong một chu kỳ. */
@Schema({ ...jsonSchemaOptions, collection: 'link_plans' })
export class LinkPlan {
  /** Mã ổn định: "free", "pro"… */
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  description: string;

  /** Số link được tạo trong mỗi chu kỳ. */
  @Prop({ required: true, min: 0 })
  limit: number;

  @Prop({ required: true, enum: ['day', 'week', 'month'], default: 'day' })
  period: LinkPeriod;

  /** Giá theo thời hạn mua. Chỉ cần nhập giá 1 tháng; giá 3 và 12 tháng tự tính theo discount3/discount12. Gói free không có giá. */
  @Prop({ type: [LinkPlanPriceSchema], default: [] })
  prices: LinkPlanPrice[];

  /** % giảm khi mua 3 tháng so với mua lẻ 3 lần giá 1 tháng. Giá 3 tháng được hệ thống tự tính. */
  @Prop({ default: 17, min: 0, max: 90 })
  discount3: number;

  /** % giảm khi mua 12 tháng (1 năm) so với mua lẻ 12 lần giá 1 tháng. Giá 12 tháng được hệ thống tự tính. */
  @Prop({ default: 24, min: 0, max: 90 })
  discount12: number;

  @Prop({ default: 'VND' })
  currency: string;

  /**
   * Domain hệ thống mà gói này được dùng (danh sách host). Để trống = dùng được mọi domain hệ thống đang bật.
   */
  @Prop({ type: [String], default: [] })
  systemDomains: string[];

  /** Số tên miền riêng người dùng được thêm. 0 = gói không hỗ trợ tên miền riêng. */
  @Prop({ default: 0, min: 0 })
  maxCustomDomains: number;

  /** Số deeplink Shopee tạo được mỗi chu kỳ (tính riêng với deeplink TikTok). 0 = gói không có deeplink Shopee. */
  @Prop({ default: 0, min: 0 })
  shopeeLimit: number;

  /** Gói đang bán; gói tắt vẫn áp dụng cho người đã được gán đến khi hết hạn. */
  @Prop({ default: true })
  isActive: boolean;

  /** Gói được gắn nhãn "Khuyên chọn" trên bảng giá. */
  @Prop({ default: false })
  isRecommended: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export type LinkPlanDocument = HydratedDocument<LinkPlan>;
export const LinkPlanSchema = SchemaFactory.createForClass(LinkPlan);
