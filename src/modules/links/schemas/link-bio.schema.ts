import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { jsonSchemaOptions } from '../../../common/mongoose-json';

export type BioTemplate = 'neon' | 'glass' | 'sunset';

/**
 * Trang Bio Link của người dùng (mỗi người một trang): tên, handle TikTok, ảnh đại diện, giới thiệu,
 * các nút liên kết và sản phẩm nổi bật. Công khai tại /bio/<slug> khi đã xuất bản.
 */
@Schema({ ...jsonSchemaOptions, collection: 'link_bios' })
export class LinkBio {
  @Prop({ required: true, unique: true })
  ownerId: string;

  /** Tên trong địa chỉ /bio/<slug>: chữ thường, số, gạch ngang (3-32 ký tự). */
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true, enum: ['neon', 'glass', 'sunset'], default: 'neon' })
  template: BioTemplate;

  @Prop({ default: '', trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  handle: string;

  /** Ảnh đại diện: đường dẫn https (tải lên qua links/banner hoặc dán link). */
  @Prop({ default: '' })
  avatar: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [{ _id: false, title: String, url: String }], default: [] })
  buttons: { title: string; url: string }[];

  @Prop({ type: [{ _id: false, title: String, price: String, image: String, url: String }], default: [] })
  products: { title: string; price: string; image: string; url: string }[];

  /** Chỉ trang đã xuất bản mới mở được công khai. */
  @Prop({ default: false })
  published: boolean;

  @Prop({ default: 0 })
  views: number;
}
export type LinkBioDocument = HydratedDocument<LinkBio>;
export const LinkBioSchema = SchemaFactory.createForClass(LinkBio);
