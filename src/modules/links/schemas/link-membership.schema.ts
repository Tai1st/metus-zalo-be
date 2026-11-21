import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { jsonSchemaOptions } from '../../../common/mongoose-json';

/** Gói link đang áp dụng cho một người dùng (không có bản ghi = gói free). */
@Schema({ ...jsonSchemaOptions, collection: 'link_memberships' })
export class LinkMembership {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ required: true, lowercase: true, trim: true })
  planCode: string;

  /** null = không hết hạn. */
  @Prop({ type: Date, default: null })
  expiresAt: Date | null;
}

export type LinkMembershipDocument = HydratedDocument<LinkMembership>;
export const LinkMembershipSchema = SchemaFactory.createForClass(LinkMembership);
