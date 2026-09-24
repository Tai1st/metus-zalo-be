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
}

export type LeadDocument = HydratedDocument<Lead>;
export const LeadSchema = SchemaFactory.createForClass(Lead);
