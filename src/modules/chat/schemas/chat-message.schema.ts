import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** One attachment on a message — image/video/file share. */
class Attachment {
  @Prop({ required: true }) href: string;
  @Prop({ required: true }) thumb: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) isImage: boolean;
}

/**
 * Mirrors the app's `LiveMessage` type field-for-field (see metus-zalo's
 * src/lib/types.ts) — stored structured, not as an opaque JSON blob, so
 * queries like "unread, not sent by me" run in Mongo instead of the app.
 */
@Schema({ collection: 'chat_messages' })
export class ChatMessage {
  @Prop({ required: true })
  zaloId: string;

  @Prop({ required: true })
  threadId: string;

  @Prop({ required: true })
  msgId: string;

  @Prop({ required: true })
  threadType: number;

  @Prop({ required: true })
  isSelf: boolean;

  @Prop({ default: '' })
  fromId: string;

  @Prop({ default: '' })
  fromName: string;

  @Prop({ default: '' })
  content: string;

  @Prop({ required: true })
  ts: number;

  @Prop({ type: Attachment, required: false })
  attachment?: Attachment;

  @Prop({ required: false })
  stickerId?: number;

  @Prop({ required: false })
  systemLabel?: string;
}

export type ChatMessageDocument = HydratedDocument<ChatMessage>;
export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
ChatMessageSchema.index(
  { zaloId: 1, threadId: 1, msgId: 1 },
  { unique: true },
);
ChatMessageSchema.index({ zaloId: 1, threadId: 1, ts: -1 });
ChatMessageSchema.index({ zaloId: 1, ts: -1 });
