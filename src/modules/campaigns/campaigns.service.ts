import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CounterService } from '../../common/counter.service';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import {
  CampaignLog,
  CampaignLogDocument,
} from './schemas/campaign-log.schema';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign-input.dto';
import { AddLogDto } from './dto/add-log.dto';

export type CampaignPublic = {
  id: number;
  name: string;
  kind: string;
  status: string;
  config: string;
  accountIds: string[];
  targets: string[];
  sentOk: number;
  sentFail: number;
  createdAt: string;
  updatedAt: string;
};

export type CampaignLogPublic = {
  id: number;
  campaignId: number;
  target: string;
  accountId: string;
  ok: boolean;
  message: string;
  ts: string;
};

const CAMPAIGN_COUNTER = 'campaigns';
const LOG_COUNTER = 'campaign_logs';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectModel(Campaign.name) private readonly model: Model<CampaignDocument>,
    @InjectModel(CampaignLog.name)
    private readonly logModel: Model<CampaignLogDocument>,
    private readonly counters: CounterService,
  ) {}

  private toPublic(doc: CampaignDocument): CampaignPublic {
    return {
      id: doc.seq,
      name: doc.name,
      kind: doc.kind,
      status: doc.status,
      config: doc.config,
      accountIds: doc.accountIds,
      targets: doc.targets,
      sentOk: doc.sentOk,
      sentFail: doc.sentFail,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toLogPublic(doc: CampaignLogDocument): CampaignLogPublic {
    return {
      id: doc.seq,
      campaignId: doc.campaignId,
      target: doc.target,
      accountId: doc.accountId,
      ok: doc.ok,
      message: doc.message,
      ts: doc.ts,
    };
  }

  async list(): Promise<CampaignPublic[]> {
    const rows = await this.model.find().sort({ seq: -1 });
    return rows.map((r) => this.toPublic(r));
  }

  async get(id: number): Promise<CampaignPublic | null> {
    const row = await this.model.findOne({ seq: id });
    return row ? this.toPublic(row) : null;
  }

  private async getOrThrow(id: number): Promise<CampaignDocument> {
    const row = await this.model.findOne({ seq: id });
    if (!row) throw new NotFoundException('Không tìm thấy chiến dịch');
    return row;
  }

  async create(dto: CreateCampaignDto): Promise<CampaignPublic> {
    const seq = await this.counters.next(CAMPAIGN_COUNTER);
    const now = new Date().toISOString();
    const row = await this.model.create({
      seq,
      name: dto.name,
      kind: dto.kind,
      status: 'draft',
      config: dto.config,
      accountIds: dto.accountIds,
      targets: dto.targets,
      createdAt: now,
      updatedAt: now,
    });
    return this.toPublic(row);
  }

  async update(id: number, dto: UpdateCampaignDto): Promise<CampaignPublic> {
    const cur = await this.getOrThrow(id);
    cur.name = dto.name ?? cur.name;
    cur.config = dto.config ?? cur.config;
    cur.accountIds = dto.accountIds ?? cur.accountIds;
    cur.targets = dto.targets ?? cur.targets;
    cur.updatedAt = new Date().toISOString();
    await cur.save();
    return this.toPublic(cur);
  }

  async updateStatus(id: number, status: string): Promise<void> {
    await this.model.updateOne(
      { seq: id },
      { status, updatedAt: new Date().toISOString() },
    );
  }

  /** Wipe a campaign's send history and reset its counters (run mode "restart"). */
  async resetProgress(id: number): Promise<void> {
    await this.logModel.deleteMany({ campaignId: id });
    await this.model.updateOne(
      { seq: id },
      { sentOk: 0, sentFail: 0, updatedAt: new Date().toISOString() },
    );
  }

  async bumpCounters(id: number, ok: boolean): Promise<void> {
    await this.model.updateOne(
      { seq: id },
      {
        $inc: ok ? { sentOk: 1 } : { sentFail: 1 },
        $set: { updatedAt: new Date().toISOString() },
      },
    );
  }

  async remove(id: number): Promise<void> {
    await this.model.deleteOne({ seq: id });
    await this.logModel.deleteMany({ campaignId: id });
  }

  async addLog(campaignId: number, dto: AddLogDto): Promise<void> {
    const seq = await this.counters.next(LOG_COUNTER);
    await this.logModel.create({
      seq,
      campaignId,
      target: dto.target,
      accountId: dto.accountId ?? '',
      ok: dto.ok,
      message: dto.message ?? '',
      ts: new Date().toISOString(),
    });
  }

  async listLogs(
    campaignId: number,
    limit: number,
  ): Promise<CampaignLogPublic[]> {
    const rows = await this.logModel
      .find({ campaignId })
      .sort({ seq: -1 })
      .limit(limit);
    return rows.map((r) => this.toLogPublic(r));
  }

  /** Targets that already have a success / failure log entry for this campaign. */
  async targetsWithOutcome(campaignId: number, ok: boolean): Promise<string[]> {
    return this.logModel.distinct('target', { campaignId, ok });
  }

  /** Count sends in the trailing window for the daily-limit check. */
  async countSentSince(campaignId: number, sinceIso: string): Promise<number> {
    return this.logModel.countDocuments({
      campaignId,
      ok: true,
      ts: { $gte: sinceIso },
    });
  }
}
