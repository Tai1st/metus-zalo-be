import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** One document per app user (`key` = their Mongo user id) — the notification
 * bell's "mark all as read" cutoff, kept separate so one person reading
 * their notifications doesn't clear everyone else's unread count. */
@Schema({ collection: 'notification_state' })
export class NotificationState {
  @Prop({ required: true, unique: true, default: 'global' })
  key: string;

  @Prop({ required: true, default: 0 })
  lastReadAt: number;
}

export type NotificationStateDocument = HydratedDocument<NotificationState>;
export const NotificationStateSchema = SchemaFactory.createForClass(NotificationState);
