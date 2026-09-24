import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { jsonSchemaOptions } from '../../../common/mongoose-json';

@Schema({ _id: false })
export class PlanPrice {
  @Prop({ required: true, min: 1 })
  months: number;

  @Prop({ required: true, min: 0 })
  price: number;
}
export const PlanPriceSchema = SchemaFactory.createForClass(PlanPrice);

@Schema(jsonSchemaOptions)
export class Plan {
  /** Stable slug: "personal", "business". */
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  /** Short label above the name, e.g. "Gói cá nhân". */
  @Prop({ default: '', trim: true })
  tagline: string;

  @Prop({ default: '', trim: true })
  description: string;

  /** One price per billing period (3 / 6 / 12 months …). */
  @Prop({ type: [PlanPriceSchema], default: [] })
  prices: PlanPrice[];

  @Prop({ default: 'VND' })
  currency: string;

  @Prop({ type: [String], default: [] })
  features: string[];

  /** Login accounts included (Personal = 1, Business = admin + 3 staff). */
  @Prop({ required: true, min: 1, default: 1 })
  maxUsers: number;

  /** Highlighted as "most chosen". */
  @Prop({ default: false })
  isPopular: boolean;

  /** Exact length in days; overrides the calendar-month length (trial = 30). */
  @Prop({ type: Number, default: null })
  durationDays: number | null;

  /** Hidden plans (e.g. trial) are only granted by an admin, never listed or bought. */
  @Prop({ default: true })
  isPublic: boolean;

  /** Inactive plans stay for existing subscribers but cannot be bought. */
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export type PlanDocument = HydratedDocument<Plan>;
export const PlanSchema = SchemaFactory.createForClass(Plan);
