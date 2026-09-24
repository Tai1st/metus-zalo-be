import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CounterService } from '../../common/counter.service';
import { CreateLabelDto, UpdateLabelDto } from './dto/label-body.dto';
import {
  AccountLabel,
  AccountLabelDocument,
} from './schemas/account-label.schema';
import {
  ZaloAccount,
  ZaloAccountDocument,
} from './schemas/zalo-account.schema';

export type AccountLabelPublic = {
  id: number;
  name: string;
  color: string;
  accountCount: number;
  createdAt: string;
};

const COUNTER = 'account_labels';

@Injectable()
export class AccountLabelsService {
  constructor(
    @InjectModel(AccountLabel.name)
    private readonly model: Model<AccountLabelDocument>,
    @InjectModel(ZaloAccount.name)
    private readonly accounts: Model<ZaloAccountDocument>,
    private readonly counters: CounterService,
  ) {}

  async list(): Promise<AccountLabelPublic[]> {
    const rows = await this.model.find().sort({ seq: 1 });
    const out: AccountLabelPublic[] = [];
    for (const r of rows) {
      out.push({
        id: r.seq,
        name: r.name,
        color: r.color,
        accountCount: await this.accounts.countDocuments({ labelIds: r.seq }),
        createdAt: r.createdAt,
      });
    }
    return out;
  }

  async create(dto: CreateLabelDto): Promise<AccountLabelPublic> {
    const seq = await this.counters.next(COUNTER);
    await this.model.create({
      seq,
      name: dto.name,
      color: dto.color ?? '#0068ff',
      createdAt: new Date().toISOString(),
    });
    return {
      id: seq,
      name: dto.name,
      color: dto.color ?? '#0068ff',
      accountCount: 0,
      createdAt: new Date().toISOString(),
    };
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
    // Mirrors the old ON DELETE CASCADE on account_label_map.
    await this.accounts.updateMany(
      { labelIds: id },
      { $pull: { labelIds: id } },
    );
  }
}
