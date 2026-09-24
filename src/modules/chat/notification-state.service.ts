import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NotificationState,
  NotificationStateDocument,
} from './schemas/notification-state.schema';

@Injectable()
export class NotificationStateService {
  constructor(
    @InjectModel(NotificationState.name)
    private readonly model: Model<NotificationStateDocument>,
  ) {}

  async getLastReadAt(userId: string): Promise<number> {
    const row = await this.model.findOne({ key: userId });
    return row?.lastReadAt ?? 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const now = Date.now();
    await this.model.updateOne(
      { key: userId },
      { $set: { lastReadAt: now } },
      { upsert: true },
    );
    return now;
  }
}
