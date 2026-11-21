import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { jsonSchemaOptions } from '../../../common/mongoose-json';

export type LinkOrderStatus = 'pending' | 'paid' | 'cancelled';

/** Đơn mua gói link: người dùng chuyển khoản theo mã đơn, thanh toán xong gói tự kích hoạt. */
@Schema({ ...jsonSchemaOptions, collection: 'link_orders' })
export class LinkOrder {
  /** Mã đơn, cũng là nội dung chuyển khoản: "LK" + 6 ký tự. */
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  planCode: string;

  /** Ảnh chụp tên gói và giá lúc đặt, để đổi giá sau này không ảnh hưởng đơn cũ. */
  @Prop({ required: true })
  planName: string;

  @Prop({ required: true, min: 1 })
  months: number;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: 'VND' })
  currency: string;

  @Prop({ required: true, enum: ['pending', 'paid', 'cancelled'], default: 'pending' })
  status: LinkOrderStatus;

  @Prop({ type: Date, default: null })
  paidAt: Date | null;

  /** Ai xác nhận: "admin:<id>" hoặc tên cổng thanh toán tự động. */
  @Prop({ default: '' })
  paidBy: string;

  /** Mã giao dịch ngân hàng (nếu có) để đối soát. */
  @Prop({ default: '' })
  txRef: string;
}

export type LinkOrderDocument = HydratedDocument<LinkOrder>;
export const LinkOrderSchema = SchemaFactory.createForClass(LinkOrder);
LinkOrderSchema.index({ userId: 1, status: 1, createdAt: -1 });
