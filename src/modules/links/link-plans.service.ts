import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LinkPeriod,
  LinkPlan,
  LinkPlanDocument,
} from './schemas/link-plan.schema';
import {
  LinkMembership,
  LinkMembershipDocument,
} from './schemas/link-membership.schema';
import {
  AssignLinkPlanDto,
  CreateLinkPlanDto,
  UpdateLinkPlanDto,
} from './dto/link-plan.dto';
import { UsersService } from '../users/users.service';
import { addMonths, hasDuplicateMonths } from '../../common/pricing';

export const FREE_PLAN_CODE = 'free';
const VN_OFFSET = 7 * 3600_000;

/** Đầu chu kỳ hiện tại theo giờ Việt Nam (UTC+7), trả về Date (UTC). */
export function periodStart(period: LinkPeriod): Date {
  const local = new Date(Date.now() + VN_OFFSET);
  local.setUTCHours(0, 0, 0, 0);
  if (period === 'week') {
    // Tuần bắt đầu thứ Hai.
    local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  } else if (period === 'month') {
    local.setUTCDate(1);
  }
  return new Date(local.getTime() - VN_OFFSET);
}

@Injectable()
export class LinkPlansService implements OnModuleInit {
  private readonly log = new Logger(LinkPlansService.name);

  constructor(
    @InjectModel(LinkPlan.name) private readonly plans: Model<LinkPlanDocument>,
    @InjectModel(LinkMembership.name)
    private readonly memberships: Model<LinkMembershipDocument>,
    private readonly users: UsersService,
  ) {}

  async onModuleInit() {
    if (!(await this.plans.exists({ code: FREE_PLAN_CODE }))) {
      await this.plans.create({
        code: FREE_PLAN_CODE,
        name: 'Free',
        description: 'Dùng thử',
        limit: 5,
        period: 'day',
        prices: [],
        sortOrder: 0,
      });
      this.log.log('Đã tạo gói link mặc định "free" (5 link/ngày)');
    }
  }

  listActive() {
    return this.plans.find({ isActive: true }).sort({ sortOrder: 1 });
  }

  listAll() {
    return this.plans.find().sort({ sortOrder: 1 });
  }

  async create(dto: CreateLinkPlanDto) {
    if (await this.plans.exists({ code: dto.code })) {
      throw new ConflictException('Mã gói đã tồn tại');
    }
    if (dto.prices && hasDuplicateMonths(dto.prices)) {
      throw new BadRequestException('Mỗi thời hạn chỉ được có một mức giá');
    }
    return this.plans.create(dto);
  }

  async update(code: string, dto: UpdateLinkPlanDto) {
    if (dto.prices && hasDuplicateMonths(dto.prices)) {
      throw new BadRequestException('Mỗi thời hạn chỉ được có một mức giá');
    }
    const doc = await this.plans.findOneAndUpdate({ code }, dto, { new: true });
    if (!doc) throw new NotFoundException('Không tìm thấy gói');
    return doc;
  }

  /** Ngừng bán gói (người đang dùng giữ gói đến khi hết hạn). */
  async deactivate(code: string) {
    return this.update(code, { isActive: false });
  }

  /** Gói đang áp dụng cho người dùng: gói được gán còn hạn, nếu không thì free. */
  async planFor(userId: string) {
    const m = await this.memberships.findOne({ userId });
    const valid = !!m && (!m.expiresAt || m.expiresAt.getTime() > Date.now());
    if (valid) {
      const p = await this.plans.findOne({ code: m.planCode });
      if (p) return { plan: p, expiresAt: m.expiresAt };
    }
    const free = await this.plans.findOne({ code: FREE_PLAN_CODE });
    if (!free) throw new NotFoundException('Thiếu gói free');
    // Gói free có thể bị admin tắt: người chưa có gói trả phí còn hạn thì không được tạo link mới.
    return { plan: free, expiresAt: null as Date | null };
  }

  async assign(dto: AssignLinkPlanDto) {
    if (!(await this.users.findById(dto.userId))) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    if (!(await this.plans.exists({ code: dto.planCode.toLowerCase() }))) {
      throw new NotFoundException('Không tìm thấy gói');
    }
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Ngày hết hạn phải ở tương lai');
    }
    return this.memberships.findOneAndUpdate(
      { userId: dto.userId },
      { planCode: dto.planCode.toLowerCase(), expiresAt },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  }

  /**
   * Kích hoạt gói sau khi thanh toán: mua lại cùng gói đang còn hạn thì cộng dồn thêm thời hạn,
   * mua gói khác thì áp dụng ngay từ bây giờ (thay gói cũ).
   */
  async grant(userId: string, planCode: string, months: number) {
    const code = planCode.toLowerCase();
    const cur = await this.memberships.findOne({ userId });
    const stillValid = !!cur && (!cur.expiresAt || cur.expiresAt.getTime() > Date.now());
    const base =
      stillValid && cur.planCode === code && cur.expiresAt ? cur.expiresAt : new Date();
    return this.memberships.findOneAndUpdate(
      { userId },
      { planCode: code, expiresAt: addMonths(base, months) },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  }

  async getByCode(code: string) {
    return this.plans.findOne({ code: code.toLowerCase() });
  }

  listMemberships() {
    return this.memberships.find().sort({ updatedAt: -1 }).limit(500);
  }
}
