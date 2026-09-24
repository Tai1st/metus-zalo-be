import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CounterService } from '../../common/counter.service';
import {
  FriendRequest,
  FriendRequestDocument,
} from './schemas/friend-request.schema';
import { CreateFriendRequestDto } from './dto/friend-request.dto';

const COUNTER = 'friend_requests';

export type FriendRequestPublic = {
  id: number;
  accountId: string;
  fromUid: string;
  fromName: string;
  fromAvatar: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  receivedAt: string;
  updatedAt: string;
};

@Injectable()
export class FriendRequestsService {
  constructor(
    @InjectModel(FriendRequest.name)
    private readonly model: Model<FriendRequestDocument>,
    private readonly counters: CounterService,
  ) {}

  private toPublic(r: FriendRequestDocument): FriendRequestPublic {
    return {
      id: r.seq,
      accountId: r.accountId,
      fromUid: r.fromUid,
      fromName: r.fromName,
      fromAvatar: r.fromAvatar,
      message: r.message,
      status: r.status,
      receivedAt: r.receivedAt,
      updatedAt: r.updatedAt,
    };
  }

  async list(accountId?: string): Promise<FriendRequestPublic[]> {
    const q = accountId ? { accountId } : {};
    const rows = await this.model.find(q).sort({ receivedAt: -1 });
    return rows.map((r) => this.toPublic(r));
  }

  /** Ghi lại một sự kiện lời mời kết bạn đến — idempotent theo (accountId,
   * fromUid): gửi lại lần nữa (sau khi đã reject) sẽ đưa về "pending". */
  async record(dto: CreateFriendRequestDto): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.model.findOne({
      accountId: dto.accountId,
      fromUid: dto.fromUid,
    });
    if (existing) {
      if (dto.fromName) existing.fromName = dto.fromName;
      if (dto.fromAvatar) existing.fromAvatar = dto.fromAvatar;
      if (dto.message) existing.message = dto.message;
      if (dto.receivedAt) existing.receivedAt = dto.receivedAt;
      existing.status = 'pending';
      existing.updatedAt = now;
      await existing.save();
      return;
    }
    const seq = await this.counters.next(COUNTER);
    await this.model.create({
      seq,
      accountId: dto.accountId,
      fromUid: dto.fromUid,
      fromName: dto.fromName ?? '',
      fromAvatar: dto.fromAvatar ?? '',
      message: dto.message ?? '',
      status: 'pending',
      receivedAt: dto.receivedAt ?? now,
      updatedAt: now,
    });
  }

  async setStatus(
    id: number,
    status: 'accepted' | 'rejected',
  ): Promise<void> {
    await this.model.updateOne(
      { seq: id },
      { status, updatedAt: new Date().toISOString() },
    );
  }

  async remove(id: number): Promise<void> {
    await this.model.deleteOne({ seq: id });
  }
}
