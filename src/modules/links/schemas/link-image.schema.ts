import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Banner do người dùng tải lên (PNG/JPEG ≤ 500KB), dùng làm ảnh xem trước của link thường. */
@Schema({ timestamps: true, collection: 'link_images' })
export class LinkImage {
  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({ required: true, enum: ['image/png', 'image/jpeg'] })
  mime: string;

  @Prop({ required: true, type: Buffer })
  data: Buffer;
}
export type LinkImageDocument = HydratedDocument<LinkImage>;
export const LinkImageSchema = SchemaFactory.createForClass(LinkImage);
