import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { jsonSchemaOptions } from '../../../common/mongoose-json';

export type LinkDomainKind = 'system' | 'custom';
export type LinkDomainStatus = 'pending' | 'active' | 'disabled';

/**
 * Tên miền dùng cho link rút gọn.
 * - system: do admin thêm, nằm trong kho mặc định của trang; gói quyết định gói nào dùng được domain nào.
 * - custom: người dùng tự thêm, phải xác minh quyền sở hữu bằng bản ghi DNS TXT trước khi dùng.
 */
@Schema({ ...jsonSchemaOptions, collection: 'link_domains' })
export class LinkDomain {
  /** Tên miền viết thường, không kèm giao thức, ví dụ "abc.com" hoặc "go.abc.com". */
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  host: string;

  @Prop({ required: true, enum: ['system', 'custom'] })
  kind: LinkDomainKind;

  /** Chủ sở hữu (chỉ có với custom). */
  @Prop({ default: '' })
  ownerId: string;

  @Prop({ required: true, enum: ['pending', 'active', 'disabled'], default: 'pending' })
  status: LinkDomainStatus;

  /** Chuỗi người dùng phải đặt vào bản ghi TXT `_metus-verify.<host>` để chứng minh sở hữu. */
  @Prop({ default: '' })
  verifyToken: string;

  @Prop({ type: Date, default: null })
  verifiedAt: Date | null;

  /** Domain hệ thống dùng làm mặc định khi người dùng không chọn. */
  @Prop({ default: false })
  isDefault: boolean;
}

export type LinkDomainDocument = HydratedDocument<LinkDomain>;
export const LinkDomainSchema = SchemaFactory.createForClass(LinkDomain);
LinkDomainSchema.index({ ownerId: 1, kind: 1 });
