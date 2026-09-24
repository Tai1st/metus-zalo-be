import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Tag attached to a Zalo account (e.g. "VIP", "Team A"). Membership is the
 * `labelIds` array embedded directly on each ZaloAccount document. */
@Schema({ collection: 'account_labels' })
export class AccountLabel {
  @Prop({ required: true, unique: true })
  seq: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, default: '#0068ff' })
  color: string;

  @Prop({ required: true })
  createdAt: string;
}

export type AccountLabelDocument = HydratedDocument<AccountLabel>;
export const AccountLabelSchema = SchemaFactory.createForClass(AccountLabel);
