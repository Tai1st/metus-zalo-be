import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'campaigns' })
export class Campaign {
  @Prop({ required: true, unique: true })
  seq: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  kind: string;

  @Prop({ required: true, default: 'draft' })
  status: string;

  /** Opaque JSON blob (CampaignConfig) — shape lives in the Next app, not here. */
  @Prop({ required: true, default: '{}' })
  config: string;

  @Prop({ type: [String], default: [] })
  accountIds: string[];

  @Prop({ type: [String], default: [] })
  targets: string[];

  @Prop({ default: 0 })
  sentOk: number;

  @Prop({ default: 0 })
  sentFail: number;

  @Prop({ required: true })
  createdAt: string;

  @Prop({ required: true })
  updatedAt: string;
}

export type CampaignDocument = HydratedDocument<Campaign>;
export const CampaignSchema = SchemaFactory.createForClass(Campaign);
