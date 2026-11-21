import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { jsonSchemaOptions } from '../../../common/mongoose-json';

/** Link rút gọn TikTok Shop (sản phẩm hoặc chiến dịch). */
@Schema({ ...jsonSchemaOptions, collection: 'links' })
export class Link {
  /** Mã trong đường dẫn /s/<code>. */
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true, enum: ['product', 'campaign'] })
  kind: 'product' | 'campaign';

  /** URL web đầy đủ của TikTok (đã giải mã từ vt/vm). */
  @Prop({ required: true })
  webUrl: string;

  /** Deeplink snssdk1180://… để mở app. */
  @Prop({ required: true })
  appLink: string;

  @Prop({ default: '' })
  productId: string;

  @Prop({ default: '' })
  campaignId: string;

  /** Tên miền gắn với link; link chỉ mở được trên đúng domain này. Rỗng = mở trên domain bất kỳ của trang. */
  @Prop({ default: '', lowercase: true, trim: true })
  domain: string;

  @Prop({ default: '', trim: true })
  title: string;

  @Prop({ default: '' })
  image: string;

  /** Người tạo (id user). */
  @Prop({ required: true })
  ownerId: string;

  @Prop({ default: 0 })
  clicks: number;

  /** Xóa mềm: link đã xóa ngừng hoạt động nhưng vẫn tính vào hạn mức trong ngày. */
  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export type LinkDocument = HydratedDocument<Link>;
export const LinkSchema = SchemaFactory.createForClass(Link);
LinkSchema.index({ createdAt: -1 });
LinkSchema.index({ ownerId: 1, createdAt: -1 });
