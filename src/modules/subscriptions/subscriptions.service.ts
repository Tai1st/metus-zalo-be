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

  listAll() {
    return this.model
      .find()
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('userId', 'username fullName');
  }

  /** Admin confirms payment: starts the period and replaces any active one. */
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
