import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'campaign_logs' })
export class CampaignLog {
  @Prop({ required: true, unique: true })
  seq: number;

  @Prop({ required: true })
  campaignId: number;

  @Prop({ required: true })
  target: string;

  @Prop({ default: '' })
  accountId: string;

  @Prop({ required: true })
  ok: boolean;

  @Prop({ default: '' })
  message: string;

  @Prop({ required: true })
  ts: string;
}

export type CampaignLogDocument = HydratedDocument<CampaignLog>;
export const CampaignLogSchema = SchemaFactory.createForClass(CampaignLog);
CampaignLogSchema.index({ campaignId: 1, seq: -1 });
CampaignLogSchema.index({ campaignId: 1, target: 1, ok: 1 });
CampaignLogSchema.index({ campaignId: 1, ok: 1, ts: 1 });
