import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { jsonSchemaOptions } from '../../../common/mongoose-json';

export enum SubscriptionStatus {
  /** Chosen, waiting for an admin to confirm payment. */
  Pending = 'pending',
  Active = 'active',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

@Schema({ _id: false })
export class AddonSnapshot {
  @Prop() code: string;
  @Prop() name: string;
  @Prop() seats: number;
  @Prop() price: number;
}
const AddonSnapshotSchema = SchemaFactory.createForClass(AddonSnapshot);

/** What the customer bought and at what price — survives later plan edits. */
@Schema({ _id: false })
export class SubscriptionSnapshot {
  @Prop() planCode: string;
  @Prop() planName: string;
  @Prop() months: number;
  @Prop() planPrice: number;
  @Prop({ type: AddonSnapshotSchema, default: null })
  addon: AddonSnapshot | null;
  @Prop() totalPrice: number;
  @Prop() currency: string;
  /** Plan users + add-on seats. */
  @Prop() maxUsers: number;
}
const SubscriptionSnapshotSchema =
  SchemaFactory.createForClass(SubscriptionSnapshot);

@Schema(jsonSchemaOptions)
export class Subscription {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Plan', required: true })
  planId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Addon', default: null })
  addonId: Types.ObjectId | null;

  @Prop({ type: SubscriptionSnapshotSchema, required: true })
  snapshot: SubscriptionSnapshot;

  @Prop({
    type: String,
    enum: Object.values(SubscriptionStatus),
    default: SubscriptionStatus.Pending,
    index: true,
  })
  status: SubscriptionStatus;

  @Prop({ type: Date, default: null })
  startedAt: Date | null;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;
}

export type SubscriptionDocument = HydratedDocument<Subscription>;
export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

// The database itself guarantees these, so concurrent requests cannot break them.
// A customer has at most one active subscription...
SubscriptionSchema.index(
  { userId: 1, status: 1 },
  {
    name: 'one_active_per_user',
    unique: true,
    partialFilterExpression: { status: SubscriptionStatus.Active },
  },
);
// ...and at most one pending subscription per identical choice.
SubscriptionSchema.index(
  { userId: 1, planId: 1, addonId: 1, 'snapshot.months': 1 },
  {
    name: 'one_pending_per_choice',
    unique: true,
    partialFilterExpression: { status: SubscriptionStatus.Pending },
  },
);
