import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'schedules' })
export class Schedule {
  @Prop({ required: true, unique: true })
  seq: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  campaignId: number;

  @Prop({ required: true, default: 'daily' })
  repeat: string;

  @Prop({ required: true, default: '08:00' })
  timeOfDay: string;

  @Prop({ type: String, default: null })
  timeOfDayEnd: string | null;

  @Prop({ default: 1 })
  intervalDays: number;

  @Prop({ default: 1 })
  intervalHours: number;

  @Prop({ required: true })
  fromDate: string;

  @Prop({ type: String, default: null })
  toDate: string | null;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: false })
  skipFailed: boolean;

  @Prop({ default: false })
  skipSucceeded: boolean;

  @Prop({ type: String, default: null })
  lastRun: string | null;

  @Prop({ type: String, default: null })
  nextRun: string | null;

  @Prop({ required: true })
  createdAt: string;
}

export type ScheduleDocument = HydratedDocument<Schedule>;
export const ScheduleSchema = SchemaFactory.createForClass(Schedule);
