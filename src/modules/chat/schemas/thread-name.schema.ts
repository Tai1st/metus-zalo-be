import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Group display names, learned whenever /chat lists an account's groups —
 * the notification bell needs them and can't afford a live Zalo call per item. */
@Schema({ collection: 'thread_names' })
export class ThreadName {
  @Prop({ required: true })
  zaloId: string;

  @Prop({ required: true })
  threadId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  avatar: string;

  @Prop({ required: true })
  updatedAt: number;
}

export type ThreadNameDocument = HydratedDocument<ThreadName>;
export const ThreadNameSchema = SchemaFactory.createForClass(ThreadName);
ThreadNameSchema.index({ zaloId: 1, threadId: 1 }, { unique: true });
