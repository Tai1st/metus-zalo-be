import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PlansService } from '../plans/plans.service';
import { AddonsService } from '../addons/addons.service';
import { addMonths, priceFor } from '../../common/pricing';
import {
  Subscription,
  SubscriptionDocument,
  SubscriptionStatus,
} from './schemas/subscription.schema';
import { SubscribeDto } from './dto/subscribe.dto';

const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

@Injectable()
export class SubscriptionsService implements OnModuleInit {
  private readonly log = new Logger(SubscriptionsService.name);

  constructor(
    @InjectModel(Subscription.name)
    private readonly model: Model<SubscriptionDocument>,
    private readonly plans: PlansService,
    private readonly addons: AddonsService,
  ) {}

  /**
   * Refuse to start if the uniqueness indexes cannot be built (e.g. existing
   * rows already break them): without them concurrent requests could create
   * duplicate active / pending subscriptions.
   */
  async onModuleInit() {
    try {
      await this.model.init();
    } catch (e) {
      this.log.error(
        `Không dựng được chỉ mục đảm bảo dữ liệu đăng ký: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  /**
   * Choose a plan + billing period (+ optional staff pack). The price is
   * always computed here from the catalogue, never taken from the client. It
   * starts `pending`: an admin activates it once payment is confirmed (there
   * is no payment gateway yet).
   */
  async subscribe(userId: string, dto: SubscribeDto) {
    const plan = await this.plans.get(dto.planId);
    if (!plan.isActive) {
      throw new BadRequestException('Gói cước này đã ngừng bán');
    }
    const planPrice = priceFor(plan.prices, dto.months);
    if (planPrice === undefined) {
      throw new BadRequestException(
        `Gói ${plan.name} không có chu kỳ ${dto.months} tháng`,
      );
    }

    let addon: {
      code: string;
      name: string;
      seats: number;
      price: number;
    } | null = null;
    let addonId: Types.ObjectId | null = null;
    if (dto.addonId) {
      const a = await this.addons.get(dto.addonId);
      if (!a.isActive) {
        throw new BadRequestException('Gói mua thêm này đã ngừng bán');
      }
      if (a.requiresPlanCode !== plan.code) {
        throw new BadRequestException(
          `Gói mua thêm chỉ áp dụng cho gói ${a.requiresPlanCode}`,
        );
      }
      const addonPrice = priceFor(a.prices, dto.months);
      if (addonPrice === undefined) {
        throw new BadRequestException(
          `Gói mua thêm không có chu kỳ ${dto.months} tháng`,
        );
      }
      addon = {
        code: a.code,
        name: a.name,
        seats: a.seats,
        price: addonPrice,
      };
      addonId = a._id;
    }

    const same = {
      userId,
      planId: plan._id,
      addonId,
      'snapshot.months': dto.months,
      status: SubscriptionStatus.Pending,
    };
    const existing = await this.model.findOne(same);
    if (existing) return existing;

    try {
      return await this.model.create({
        userId,
        planId: plan._id,
        addonId,
        snapshot: {
          planCode: plan.code,
          planName: plan.name,
          months: dto.months,
          planPrice,
          addon,
          totalPrice: planPrice + (addon?.price ?? 0),
          currency: plan.currency,
          maxUsers: plan.maxUsers + (addon?.seats ?? 0),
        },
        status: SubscriptionStatus.Pending,
      });
    } catch (e) {
      // A parallel identical request won the race: return its record.
      if (isDuplicateKey(e)) {
        const winner = await this.model.findOne(same);
        if (winner) return winner;
      }
      throw e;
    }
  }

  /** The subscription currently in force, or null. */
  async current(userId: string) {
    await this.expireDue(userId);
    return this.model
      .findOne({ userId, status: SubscriptionStatus.Active })
      .sort({ startedAt: -1 });
  }

  async mine(userId: string) {
    await this.expireDue(userId);
    return this.model.find({ userId }).sort({ createdAt: -1 });
  }

  async cancel(userId: string, id: string) {
    const sub = await this.model.findOne({ _id: id, userId });
    if (!sub) throw new NotFoundException('Không tìm thấy đăng ký');
    if (
      sub.status !== SubscriptionStatus.Pending &&
      sub.status !== SubscriptionStatus.Active
    ) {
      throw new BadRequestException('Đăng ký này không thể huỷ');
    }
    sub.status = SubscriptionStatus.Cancelled;
    return sub.save();
  }

  // ---- admin ----

  /** Revenue actually collected (activated subscriptions), grouped by month
   * ("YYYY-MM"), oldest first. Pending/cancelled/expired don't count as revenue. */
  async revenueByMonth(months: number) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const rows = await this.model.aggregate<{
      _id: string;
      total: number;
      count: number;
    }>([
      {
        $match: {
          status: {
            $in: [SubscriptionStatus.Active, SubscriptionStatus.Expired],
          },
          startedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$startedAt' } },
          total: { $sum: '$snapshot.totalPrice' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({ month: r._id, total: r.total, count: r.count }));
  }

  /** How many active subscriptions per plan code — for a "plan popularity" chart. */
  async activeByPlan() {
    const rows = await this.model.aggregate<{ _id: string; count: number }>([
      { $match: { status: SubscriptionStatus.Active } },
      { $group: { _id: '$snapshot.planCode', count: { $sum: 1 } } },
    ]);
    return rows.map((r) => ({ planCode: r._id, count: r.count }));
  }

  countByStatus() {
    return this.model.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
  }

  listAll() {
    return this.model
      .find()
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('userId', 'username fullName');
  }

  /** Admin confirms payment: starts the period and replaces any active one. */
  /** Admin declines a pending subscription (e.g. payment never arrived). */
  async reject(id: string) {
    const sub = await this.model.findById(id);
    if (!sub) throw new NotFoundException('Không tìm thấy đăng ký');
    if (sub.status !== SubscriptionStatus.Pending) {
      throw new BadRequestException('Chỉ từ chối được đăng ký đang chờ');
    }
    sub.status = SubscriptionStatus.Cancelled;
    return sub.save();
  }

  async activate(id: string) {
    const sub = await this.model.findById(id);
    if (!sub) throw new NotFoundException('Không tìm thấy đăng ký');
    if (sub.status !== SubscriptionStatus.Pending) {
      throw new BadRequestException('Chỉ kích hoạt được đăng ký đang chờ');
    }
    try {
      await this.model.updateMany(
        { userId: sub.userId, status: SubscriptionStatus.Active },
        { status: SubscriptionStatus.Cancelled },
      );
      const now = new Date();
      sub.status = SubscriptionStatus.Active;
      sub.startedAt = now;
      sub.expiresAt = addMonths(now, sub.snapshot.months);
      return await sub.save();
    } catch (e) {
      if (isDuplicateKey(e)) {
        throw new ConflictException(
          'Khách hàng này vừa được kích hoạt đăng ký khác, vui lòng thử lại',
        );
      }
      throw e;
    }
  }

  /** Admin gives a customer a plan directly: created and activated at once. */
  async grant(userId: string, dto: SubscribeDto) {
    const sub = await this.subscribe(userId, dto);
    if (sub.status !== SubscriptionStatus.Pending) return sub;
    return this.activate(String(sub._id));
  }

  /** Admin adds a "+N staff" pack to a running subscription (same plan only). */
  async addSeats(id: string, addonId: string) {
    const sub = await this.model.findById(id);
    if (!sub) throw new NotFoundException('Không tìm thấy đăng ký');
    if (sub.status !== SubscriptionStatus.Active) {
      throw new BadRequestException('Chỉ thêm nhân sự cho gói đang hiệu lực');
    }
    const a = await this.addons.get(addonId);
    if (!a.isActive) {
      throw new BadRequestException('Gói mua thêm này đã ngừng bán');
    }
    if (a.requiresPlanCode !== sub.snapshot.planCode) {
      throw new BadRequestException(
        `Gói mua thêm chỉ áp dụng cho gói ${a.requiresPlanCode}`,
      );
    }
    const price = priceFor(a.prices, sub.snapshot.months);
    if (price === undefined) {
      throw new BadRequestException(
        `Gói mua thêm không có chu kỳ ${sub.snapshot.months} tháng`,
      );
    }
    const prev = sub.snapshot.addon;
    sub.snapshot.addon = {
      code: a.code,
      name: prev ? `${prev.name} + ${a.name}` : a.name,
      seats: (prev?.seats ?? 0) + a.seats,
      price: (prev?.price ?? 0) + price,
    };
    sub.snapshot.totalPrice += price;
    sub.snapshot.maxUsers += a.seats;
    sub.markModified('snapshot');
    return sub.save();
  }

  /**
   * Admin edits a running subscription: switch plan, move the expiry date,
   * and/or set the total number of extra staff seats (add or remove).
   */
  async adminUpdate(
    id: string,
    input: {
      planId?: string;
      expiresAt?: Date;
      extraSeats?: number;
      addonId?: string;
      months?: number;
    },
  ) {
    const sub = await this.model.findById(id);
    if (!sub) throw new NotFoundException('Không tìm thấy đăng ký');
    if (sub.status !== SubscriptionStatus.Active) {
      throw new BadRequestException('Chỉ sửa được gói đang hiệu lực');
    }
    const snap = sub.snapshot;
    const monthsChanged = !!input.months && input.months !== snap.months;
    if (monthsChanged) {
      const plan = await this.plans.get(String(sub.planId));
      const price = priceFor(plan.prices, input.months!);
      if (price === undefined) {
        throw new BadRequestException(
          `Gói ${plan.name} không có chu kỳ ${input.months} tháng`,
        );
      }
      if (snap.addon && sub.addonId) {
        const a = await this.addons.get(String(sub.addonId));
        const ap = priceFor(a.prices, input.months!);
        if (ap === undefined) {
          throw new BadRequestException(
            `Gói mua thêm không có chu kỳ ${input.months} tháng`,
          );
        }
        snap.addon.price = Math.round((ap / a.seats) * snap.addon.seats);
      }
      snap.months = input.months!;
      snap.planPrice = price;
      snap.totalPrice = price + (snap.addon?.price ?? 0);
    }
    let extra = snap.addon?.seats ?? 0;
    const perSeat =
      snap.addon && snap.addon.seats > 0
        ? snap.addon.price / snap.addon.seats
        : 0;

    if (input.planId && input.planId !== String(sub.planId)) {
      const plan = await this.plans.get(input.planId);
      const price = priceFor(plan.prices, snap.months);
      if (price === undefined) {
        throw new BadRequestException(
          `Gói ${plan.name} không có chu kỳ ${snap.months} tháng`,
        );
      }
      sub.planId = plan._id;
      snap.planCode = plan.code;
      snap.planName = plan.name;
      snap.planPrice = price;
      snap.currency = plan.currency;
      snap.maxUsers = plan.maxUsers;
      if (input.extraSeats === undefined && snap.addon) {
        // Staff packs only exist for the plan they were bought for.
        const a = await this.addons.get(String(sub.addonId));
        if (a.requiresPlanCode !== plan.code) extra = 0;
      }
      if (input.extraSeats === undefined) input.extraSeats = extra;
      sub.addonId = extra > 0 ? sub.addonId : null;
    }

    if (input.addonId) {
      const a = await this.addons.get(input.addonId);
      if (!a.isActive) {
        throw new BadRequestException('Gói mua thêm này đã ngừng bán');
      }
      if (a.requiresPlanCode !== snap.planCode) {
        throw new BadRequestException(
          `Gói mua thêm chỉ áp dụng cho gói ${a.requiresPlanCode}`,
        );
      }
      const price = priceFor(a.prices, snap.months);
      if (price === undefined) {
        throw new BadRequestException(
          `Gói mua thêm không có chu kỳ ${snap.months} tháng`,
        );
      }
      snap.addon = {
        code: a.code,
        name: a.name,
        seats: a.seats,
        price,
      };
      sub.addonId = a._id;
      input.extraSeats = a.seats;
    } else if (input.extraSeats !== undefined) {
      extra = input.extraSeats;
      if (extra === 0) sub.addonId = null;
      snap.addon =
        extra > 0
          ? {
              code: snap.addon?.code ?? 'manual',
              name: snap.addon?.name ?? 'Thêm nhân sự',
              seats: extra,
              price: Math.round(perSeat * extra),
            }
          : null;
    }
    if (input.planId || input.extraSeats !== undefined) {
      const plan = await this.plans.get(String(sub.planId));
      snap.maxUsers = plan.maxUsers + (snap.addon?.seats ?? 0);
      snap.totalPrice = snap.planPrice + (snap.addon?.price ?? 0);
    }

    if (input.expiresAt) {
      if (input.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Hạn dùng phải ở tương lai');
      }
      sub.expiresAt = input.expiresAt;
    }
    sub.markModified('snapshot');
    return sub.save();
  }

  private expireDue(userId: string) {
    return this.model.updateMany(
      {
        userId: new Types.ObjectId(userId),
        status: SubscriptionStatus.Active,
        expiresAt: { $ne: null, $lte: new Date() },
      },
      { status: SubscriptionStatus.Expired },
    );
  }
}
