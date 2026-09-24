import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CounterService } from '../../common/counter.service';
import { CreateLabelDto, UpdateLabelDto } from './dto/label-body.dto';
import { ChatLabel, ChatLabelDocument } from './schemas/chat-label.schema';
import {
  ChatLabelAssignment,
  ChatLabelAssignmentDocument,
} from './schemas/chat-label-assignment.schema';

export type ChatLabelPublic = {
  id: number;
  name: string;
  color: string;
  createdAt: string;
};

const COUNTER = 'chat_labels';

@Injectable()
export class ChatLabelsService {
  constructor(
    @InjectModel(ChatLabel.name)
    private readonly model: Model<ChatLabelDocument>,
    @InjectModel(ChatLabelAssignment.name)
    private readonly assignments: Model<ChatLabelAssignmentDocument>,
    private readonly counters: CounterService,
  ) {}

  private toPublic(doc: ChatLabelDocument): ChatLabelPublic {
    return {
      id: doc.seq,
      name: doc.name,
      color: doc.color,
      createdAt: doc.createdAt,
    };
  }

  async list(): Promise<ChatLabelPublic[]> {
    return (await this.model.find().sort({ seq: 1 })).map((r) =>
      this.toPublic(r),
    );
  }

  async create(dto: CreateLabelDto): Promise<ChatLabelPublic> {
    const seq = await this.counters.next(COUNTER);
    const row = await this.model.create({
      seq,
      name: dto.name,
      color: dto.color ?? '#f04438',
      createdAt: new Date().toISOString(),
    });
    return this.toPublic(row);
  }

  async update(id: number, dto: UpdateLabelDto): Promise<void> {
    const set: Record<string, unknown> = {};
    if (dto.name) set.name = dto.name;
    if (dto.color) set.color = dto.color;
    if (Object.keys(set).length === 0) return;
    const res = await this.model.updateOne({ seq: id }, set);
    if (res.matchedCount === 0)
      throw new NotFoundException('Không tìm thấy nhãn');
  }

  async remove(id: number): Promise<void> {
    await this.model.deleteOne({ seq: id });
    await this.assignments.deleteMany({ labelId: id });
  }

  async getThreadLabelIds(
    accountId: string,
    threadId: string,
  ): Promise<number[]> {
    const rows = await this.assignments.find({ accountId, threadId });
    return rows.map((r) => r.labelId);
  }

  async setThreadLabels(
    accountId: string,
    threadId: string,
    labelIds: number[],
  ): Promise<void> {
    await this.assignments.deleteMany({ accountId, threadId });
    const unique = [...new Set(labelIds)];
    if (unique.length > 0) {
      await this.assignments.insertMany(
        unique.map((labelId) => ({ labelId, accountId, threadId })),
      );
    }
  }

  /** thread_id -> label ids, for one account (badges the conversation list). */
  async threadLabelsForAccount(
    accountId: string,
  ): Promise<Record<string, number[]>> {
    const rows = await this.assignments.find({ accountId });
    const out: Record<string, number[]> = {};
    for (const r of rows) (out[r.threadId] ??= []).push(r.labelId);
    return out;
  }
}
