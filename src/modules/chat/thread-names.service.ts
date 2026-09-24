import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ThreadName, ThreadNameDocument } from './schemas/thread-name.schema';

@Injectable()
export class ThreadNamesService {
  constructor(
    @InjectModel(ThreadName.name)
    private readonly model: Model<ThreadNameDocument>,
  ) {}

  async upsertMany(
    zaloId: string,
    threads: { id: string; name: string; avatar: string }[],
  ): Promise<void> {
    if (threads.length === 0) return;
    const now = Date.now();
    await this.model.bulkWrite(
      threads.map((t) => ({
        updateOne: {
          filter: { zaloId, threadId: t.id },
          update: { $set: { name: t.name, avatar: t.avatar, updatedAt: now } },
          upsert: true,
        },
      })),
    );
  }

  async get(zaloId: string, threadId: string): Promise<string | null> {
    const row = await this.model.findOne({ zaloId, threadId });
    return row?.name ?? null;
  }
}
