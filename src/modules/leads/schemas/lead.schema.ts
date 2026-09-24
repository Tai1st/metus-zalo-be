import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** A "Dùng thử" form submission from the landing page. */
@Schema({ collection: 'leads' })
export class Lead {
  @Prop({ required: true, unique: true })
  seq: number;

  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  scale: string;

  @Prop({ default: '' })
  referrer: string;

  @Prop({ required: true })
  createdAt: string;

  /** Requests submitted from now on wait for admin approval. Older rows have no status. */
  @Prop({ type: String, enum: ['pending', 'approved'], default: 'pending' })
  status: 'pending' | 'approved';

  /** TTL: a pending request is deleted by MongoDB at this time; approval unsets it. */
  @Prop({ type: Date })
  expireAt?: Date;

  @Prop({ type: String, default: '' })
  approvedUserId: string;

  @Prop({ type: Date })
  approvedAt?: Date;
}

export type LeadDocument = HydratedDocument<Lead>;
export const LeadSchema = SchemaFactory.createForClass(Lead);
LeadSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
