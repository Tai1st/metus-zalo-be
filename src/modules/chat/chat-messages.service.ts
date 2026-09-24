import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ChatMessage,
  ChatMessageDocument,
} from './schemas/chat-message.schema';

export type LiveMessagePublic = {
  id: string;
  threadId: string;
  threadType: number;
  isSelf: boolean;
  fromId: string;
  fromName: string;
  content: string;
  ts: number;
  attachment?: { href: string; thumb: string; title: string; isImage: boolean };
  stickerId?: number;
  systemLabel?: string;
};

const THREAD_HISTORY_LIMIT = 300;

@Injectable()
export class ChatMessagesService {
  constructor(
    @InjectModel(ChatMessage.name)
    private readonly model: Model<ChatMessageDocument>,
  ) {}

  private toPublic(doc: ChatMessageDocument): LiveMessagePublic {
    return {
      id: doc.msgId,
      threadId: doc.threadId,
      threadType: doc.threadType,
      isSelf: doc.isSelf,
      fromId: doc.fromId,
      fromName: doc.fromName,
      content: doc.content,
      ts: doc.ts,
      attachment: doc.attachment,
      stickerId: doc.stickerId,
      systemLabel: doc.systemLabel,
    };
  }

  /** Idempotent by (zaloId, threadId, msgId) — best-effort, mirrors "INSERT OR IGNORE". */
  async persist(zaloId: string, m: LiveMessagePublic): Promise<void> {
    try {
      await this.model.updateOne(
        { zaloId, threadId: m.threadId, msgId: m.id },
        {
          $setOnInsert: {
            zaloId,
            threadId: m.threadId,
            msgId: m.id,
            threadType: m.threadType,
            isSelf: m.isSelf,
            fromId: m.fromId,
            fromName: m.fromName,
            content: m.content,
            ts: m.ts,
            attachment: m.attachment,
            stickerId: m.stickerId,
            systemLabel: m.systemLabel,
          },
        },
        { upsert: true },
      );
    } catch {
      /* persistence is best-effort */
    }
  }

  async threadMessages(
    zaloId: string,
    threadId: string,
  ): Promise<LiveMessagePublic[]> {
    const rows = await this.model
      .find({ zaloId, threadId })
      .sort({ ts: -1 })
      .limit(THREAD_HISTORY_LIMIT);
    return rows.map((r) => this.toPublic(r));
  }

  /** Latest N raw rows for an account (any thread), newest first. */
  async recent(zaloId: string, limit: number): Promise<LiveMessagePublic[]> {
    const rows = await this.model
      .find({ zaloId })
      .sort({ ts: -1 })
      .limit(limit);
    return rows.map((r) => this.toPublic(r));
  }

  async lastMessageTimestamps(zaloId: string): Promise<Record<string, number>> {
    const rows = await this.model.aggregate<{ _id: string; ts: number }>([
      { $match: { zaloId } },
      { $group: { _id: '$threadId', ts: { $max: '$ts' } } },
    ]);
    const out: Record<string, number> = {};
    for (const r of rows) out[r._id] = r.ts;
    return out;
  }

  async lastMessagePreviews(
    zaloId: string,
  ): Promise<Record<string, LiveMessagePublic>> {
    const rows = await this.model.aggregate<ChatMessageDocument>([
      { $match: { zaloId } },
      { $sort: { ts: -1 } },
      { $group: { _id: '$threadId', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ]);
    const out: Record<string, LiveMessagePublic> = {};
    for (const r of rows) out[r.threadId] = this.toPublic(r);
    return out;
  }

  async unreadCountSince(zaloId: string, sinceTs: number): Promise<number> {
    return this.model.countDocuments({
      zaloId,
      isSelf: false,
      ts: { $gt: sinceTs },
    });
  }
}
