import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** One (label, account, thread) assignment — a conversation can carry several
 * labels, mirroring the old SQLite `chat_label_map` mapping table. */
@Schema({ collection: 'chat_label_assignments' })
export class ChatLabelAssignment {
  @Prop({ required: true })
  labelId: number;

  @Prop({ required: true })
  accountId: string;

  @Prop({ required: true })
  threadId: string;
}

export type ChatLabelAssignmentDocument = HydratedDocument<ChatLabelAssignment>;
export const ChatLabelAssignmentSchema =
  SchemaFactory.createForClass(ChatLabelAssignment);
ChatLabelAssignmentSchema.index(
  { accountId: 1, threadId: 1, labelId: 1 },
  { unique: true },
);
