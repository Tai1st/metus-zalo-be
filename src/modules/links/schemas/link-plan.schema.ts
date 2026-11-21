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
  @Prop({ required: true, min: 1 })
  limit: number;

  @Prop({ required: true, enum: ['day', 'week', 'month'], default: 'day' })
  period: LinkPeriod;

  /** Giá theo thời hạn mua (1 / 3 / 12 tháng…). Gói free không có giá. */
  @Prop({ type: [LinkPlanPriceSchema], default: [] })
  prices: LinkPlanPrice[];

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

  /** Gói đang bán; gói tắt vẫn áp dụng cho người đã được gán đến khi hết hạn. */
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export type LinkPlanDocument = HydratedDocument<LinkPlan>;
export const LinkPlanSchema = SchemaFactory.createForClass(LinkPlan);
