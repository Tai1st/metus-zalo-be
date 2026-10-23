import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { jsonSchemaOptions } from '../../../common/mongoose-json';

export enum CertOrderStatus {
  AwaitingPayment = 'awaiting_payment',
  /** Đã nhận tiền nhưng chưa gửi được đơn sang nhà cung cấp (vd: hết số dư ví). */
  Paid = 'paid',
  Provisioning = 'provisioning',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

/** Đơn mua chứng chỉ iOS cho một UDID. */
@Schema({ ...jsonSchemaOptions, collection: 'cert_orders' })
export class CertOrder {
  /** Mã đơn, cũng là nội dung chuyển khoản. */
  @Prop({ required: true, unique: true }) code: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true }) udid: string;
  @Prop({ type: String, enum: ['iphone', 'ipad'], default: 'iphone' })
  device: 'iphone' | 'ipad';
  @Prop({ required: true }) planId: string;
  @Prop() planTitle: string;
  /** Giá gốc nhà cung cấp. */
  @Prop() costAmount: number;
  @Prop() costCurrency: string;
  /** Giá khách trả (đã nhân hệ số). */
  @Prop({ required: true }) price: number;
  @Prop({ default: 'VND' }) currency: string;
  @Prop() p12Password: string;
  @Prop({
    type: String,
    enum: Object.values(CertOrderStatus),
    default: CertOrderStatus.AwaitingPayment,
    index: true,
  })
  status: CertOrderStatus;
  @Prop() paidAt?: Date;
  @Prop({ index: true }) providerOrderCode?: string;
  @Prop() downloadUrl?: string;
  @Prop({ default: '' }) error: string;
}

export type CertOrderDocument = HydratedDocument<CertOrder>;
export const CertOrderSchema = SchemaFactory.createForClass(CertOrder);
