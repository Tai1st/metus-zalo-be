import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { jsonSchemaOptions } from '../../../common/mongoose-json';
import { PlanPrice, PlanPriceSchema } from '../../plans/schemas/plan.schema';

/** "+3 tài khoản nhân sự" — extra seats bought on top of a plan. */
@Schema(jsonSchemaOptions)
export class Addon {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  /** Extra login accounts this pack adds. */
  @Prop({ required: true, min: 1 })
  seats: number;

  @Prop({ type: [PlanPriceSchema], default: [] })
  prices: PlanPrice[];

  @Prop({ default: 'VND' })
  currency: string;

  /** Only sold together with this plan (the landing page: Business). */
  @Prop({ default: 'business', lowercase: true })
  requiresPlanCode: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export type AddonDocument = HydratedDocument<Addon>;
export const AddonSchema = SchemaFactory.createForClass(Addon);
