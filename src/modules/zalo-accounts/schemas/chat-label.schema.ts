import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Tag attached to a conversation (thread), independent from account labels. */
@Schema({ collection: 'chat_labels' })
export class ChatLabel {
  @Prop({ required: true, unique: true })
  seq: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, default: '#f04438' })
  color: string;

  @Prop({ required: true })
  createdAt: string;
}

export type ChatLabelDocument = HydratedDocument<ChatLabel>;
export const ChatLabelSchema = SchemaFactory.createForClass(ChatLabel);
