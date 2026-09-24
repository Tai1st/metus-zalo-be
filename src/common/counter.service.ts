import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Counter, CounterDocument } from './counter.schema';

@Injectable()
export class CounterService {
  constructor(
    @InjectModel(Counter.name) private readonly model: Model<CounterDocument>,
  ) {}

  async next(name: string): Promise<number> {
    const doc = await this.model.findOneAndUpdate(
      { name },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    return doc.seq;
  }

  /** Used by the one-time SQLite migration to keep counters ahead of the
   * ids it just imported, so freshly created rows never collide. */
  async ensureAtLeast(name: string, value: number): Promise<void> {
    await this.model.updateOne(
      { name },
      { $max: { seq: value } },
      { upsert: true },
    );
  }
}
