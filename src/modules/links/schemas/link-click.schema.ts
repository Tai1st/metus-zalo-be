import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Số ngày giữ nhật ký lượt bấm; quá hạn MongoDB tự xóa (TTL). */
export const CLICK_TTL_DAYS = 90;

/**
 * Một lượt bấm của người thật vào link rút gọn (bot quét link không được ghi). Không lưu địa chỉ IP.
 * Dùng cho trang Thống kê: lượt bấm theo ngày, thiết bị, nguồn truy cập, quốc gia, nhật ký gần đây.
 */
@Schema({ collection: 'link_clicks' })
export class LinkClick {
  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  at: Date;

  @Prop({ default: 'other' })
  device: string;

  @Prop({ default: 'Other' })
  os: string;

  @Prop({ default: 'other' })
  source: string;

  /** Tên miền của Referer (rỗng nếu không có). */
  @Prop({ default: '' })
  refererHost: string;

  /** Mã quốc gia 2 chữ cái từ Cloudflare (rỗng nếu không biết). */
  @Prop({ default: '' })
  country: string;

  /** User-Agent nguyên văn (cắt tối đa 400 ký tự). */
  @Prop({ default: '' })
  ua: string;
}
export type LinkClickDocument = HydratedDocument<LinkClick>;
export const LinkClickSchema = SchemaFactory.createForClass(LinkClick);
LinkClickSchema.index({ ownerId: 1, at: -1 });
LinkClickSchema.index({ code: 1, at: -1 });
LinkClickSchema.index({ at: 1 }, { expireAfterSeconds: CLICK_TTL_DAYS * 86400 });
