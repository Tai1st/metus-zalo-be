import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'zalo_accounts' })
export class ZaloAccount {
  @Prop({ required: true, unique: true })
  zaloId: string;

  @Prop({ default: '' })
  fullName: string;

  @Prop({ default: '' })
  avatarUrl: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: false })
  isBusiness: boolean;

  @Prop({ required: true })
  imei: string;

  @Prop({ required: true })
  userAgent: string;

  /** AES-256-GCM, base64 — see common/crypto.ts. Never serialised to JSON. */
  @Prop({ required: true, select: false })
  cookiesEnc: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  /** Plain integer id of a ZaloProxy (see common/counter.service.ts), or null. */
  @Prop({ type: Number, default: null })
  proxyId: number | null;

  /** Plain integer ids of AccountLabel documents. */
  @Prop({ type: [Number], default: [] })
  labelIds: number[];

  @Prop({ required: true })
  createdAt: string;

  @Prop({ type: String, default: null })
  lastSeen: string | null;
}

export type ZaloAccountDocument = HydratedDocument<ZaloAccount>;
export const ZaloAccountSchema = SchemaFactory.createForClass(ZaloAccount);
