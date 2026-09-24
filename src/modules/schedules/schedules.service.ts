import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CounterService } from '../../common/counter.service';
import { Schedule, ScheduleDocument } from './schemas/schedule.schema';
import { ScheduleInputDto, UpdateScheduleDto } from './dto/schedule-input.dto';

export type SchedulePublic = {
  id: number;
  name: string;
  campaignId: number;
  campaignName: string;
  campaignKind: string;
  campaignAction: string;
  repeat: string;
  timeOfDay: string;
  timeOfDayEnd: string | null;
  intervalDays: number;
  intervalHours: number;
  fromDate: string;
  toDate: string | null;
  enabled: boolean;
  skipFailed: boolean;
  skipSucceeded: boolean;
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
};

type Joined = ScheduleDocument & {
  campaign?: { name?: string; kind?: string; config?: string };
};

const COUNTER = 'schedules';

function actionFromConfig(raw: string | undefined): string {
  try {
    return (JSON.parse(raw ?? '{}') as { action?: string }).action ?? 'message';
  } catch {
    return 'message';
  }
}

@Injectable()
export class SchedulesService {
  constructor(
    @InjectModel(Schedule.name) private readonly model: Model<ScheduleDocument>,
    private readonly counters: CounterService,
  ) {}

  private toPublic(r: Joined): SchedulePublic {
    return {
      id: r.seq,
      name: r.name,
      campaignId: r.campaignId,
      campaignName: r.campaign?.name ?? '(đã xoá)',
      campaignKind: r.campaign?.kind ?? '',
      campaignAction: actionFromConfig(r.campaign?.config),
      repeat: r.repeat,
      timeOfDay: r.timeOfDay,
      timeOfDayEnd: r.timeOfDayEnd,
      intervalDays: r.intervalDays,
      intervalHours: r.intervalHours,
      fromDate: r.fromDate,
      toDate: r.toDate,
      enabled: r.enabled,
      skipFailed: r.skipFailed,
      skipSucceeded: r.skipSucceeded,
      lastRun: r.lastRun,
      nextRun: r.nextRun,
      createdAt: r.createdAt,
    };
  }

  private async joined(match: Record<string, unknown> = {}): Promise<Joined[]> {
    return this.model.aggregate<Joined>([
      { $match: match },
      { $sort: { seq: -1 } },
      {
        $lookup: {
          from: 'campaigns',
          localField: 'campaignId',
          foreignField: 'seq',
          as: 'campaign',
        },
      },
      { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } },
    ]);
  }

  async list(): Promise<SchedulePublic[]> {
    return (await this.joined()).map((r) => this.toPublic(r));
  }

  async get(id: number): Promise<SchedulePublic | null> {
    const [row] = await this.joined({ seq: id });
    return row ? this.toPublic(row) : null;
  }

  async create(dto: ScheduleInputDto): Promise<SchedulePublic> {
    const seq = await this.counters.next(COUNTER);
    await this.model.create({
      seq,
      name: dto.name,
      campaignId: dto.campaignId,
      repeat: dto.repeat,
      timeOfDay: dto.timeOfDay,
      timeOfDayEnd: dto.timeOfDayEnd ?? null,
      intervalDays: dto.intervalDays,
      intervalHours: dto.intervalHours,
      fromDate: dto.fromDate,
      toDate: dto.toDate ?? null,
      enabled: dto.enabled,
      skipFailed: dto.skipFailed,
      skipSucceeded: dto.skipSucceeded,
      nextRun: dto.nextRun ?? null,
      createdAt: new Date().toISOString(),
    });
    return (await this.get(seq))!;
  }

  async update(id: number, dto: UpdateScheduleDto): Promise<SchedulePublic> {
    const row = await this.model.findOne({ seq: id });
    if (!row) throw new NotFoundException('Không tìm thấy lịch trình');
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.campaignId !== undefined) row.campaignId = dto.campaignId;
    if (dto.repeat !== undefined) row.repeat = dto.repeat;
    if (dto.timeOfDay !== undefined) row.timeOfDay = dto.timeOfDay;
    if (dto.timeOfDayEnd !== undefined) row.timeOfDayEnd = dto.timeOfDayEnd;
    if (dto.intervalDays !== undefined) row.intervalDays = dto.intervalDays;
    if (dto.intervalHours !== undefined) row.intervalHours = dto.intervalHours;
    if (dto.fromDate !== undefined) row.fromDate = dto.fromDate;
    if (dto.toDate !== undefined) row.toDate = dto.toDate;
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    if (dto.skipFailed !== undefined) row.skipFailed = dto.skipFailed;
    if (dto.skipSucceeded !== undefined) row.skipSucceeded = dto.skipSucceeded;
    if (dto.nextRun !== undefined) row.nextRun = dto.nextRun;
    await row.save();
    return (await this.get(id))!;
  }

  async remove(id: number): Promise<void> {
    await this.model.deleteOne({ seq: id });
  }

  async markRan(id: number, nextRun: string | null): Promise<void> {
    await this.model.updateOne(
      { seq: id },
      { lastRun: new Date().toISOString(), nextRun, enabled: nextRun !== null },
    );
  }
}
