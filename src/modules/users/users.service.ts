import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Role } from '../../common/enums/role.enum';
import { User, UserDocument } from './schemas/user.schema';
import {
  Subscription,
  SubscriptionDocument,
} from '../subscriptions/schemas/subscription.schema';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly log = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly model: Model<UserDocument>,
    @InjectModel(Subscription.name)
    private readonly subs: Model<SubscriptionDocument>,
  ) {}

  /** Two accounts must never share a username: refuse to start without the unique index. */
  async onModuleInit() {
    try {
      await this.model.init();
    } catch (e) {
      this.log.error(
        `Không dựng được chỉ mục tên đăng nhập duy nhất: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  findByUsername(username: string, withPassword = false) {
    const q = this.model.findOne({ username: username.trim().toLowerCase() });
    return withPassword ? q.select('+passwordHash') : q;
  }

  findById(id: string) {
    return this.model.findById(id);
  }

  findByIdWithPassword(id: string) {
    return this.model.findById(id).select('+passwordHash');
  }

  async setPassword(id: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.model.updateOne({ _id: id }, { passwordHash });
  }

  async create(input: {
    username: string;
    password: string;
    fullName: string;
    phone?: string;
    role?: Role;
    allowedZaloIds?: string[];
    ownerId?: string;
  }) {
    const passwordHash = await bcrypt.hash(input.password, 12);
    return this.model.create({
      username: input.username.trim().toLowerCase(),
      passwordHash,
      fullName: input.fullName.trim(),
      phone: input.phone?.trim() ?? '',
      role: input.role ?? Role.User,
      allowedZaloIds: input.allowedZaloIds ?? [],
      ownerId: input.ownerId ?? '',
    });
  }

  /** Nhân sự của một khách hàng. */
  list(ownerId: string) {
    return this.model.find({ role: Role.Staff, ownerId }).sort({ username: 1 });
  }

  countStaff(ownerId: string) {
    return this.model.countDocuments({ role: Role.Staff, ownerId });
  }

  /** Staff seats of the active plan (plan users + add-on seats, minus the owner). */
  async staffLimit(ownerId: string): Promise<number> {
    const sub = await this.subs
      .findOne({ userId: ownerId, status: 'active' })
      .sort({ startedAt: -1 });
    if (!sub) return 0;
    if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) return 0;
    return Math.max(0, (sub.snapshot?.maxUsers ?? 1) - 1);
  }

  /**
   * Customers need an active, unexpired plan to use the web; staff ride on
   * their leader's plan (and the leader must not be locked). Admin is exempt.
   */
  async planAccessOk(user: UserDocument): Promise<boolean> {
    if (user.role === Role.Admin) return true;
    let ownerId = String(user._id);
    if (user.role === Role.Staff) {
      if (!user.ownerId) return false;
      const owner = await this.model.findById(user.ownerId);
      if (!owner || !owner.isActive) return false;
      ownerId = String(owner._id);
    }
    const sub = await this.subs
      .findOne({ userId: ownerId, status: 'active' })
      .sort({ startedAt: -1 });
    if (!sub) return false;
    if (sub.expiresAt && new Date(sub.expiresAt).getTime() <= Date.now()) {
      return false;
    }
    if (user.role === Role.Staff) {
      // Plan downgraded below the number of staff: earliest-created keep
      // their seat, the rest lose access until the leader upgrades again.
      const seats = Math.max(0, (sub.snapshot?.maxUsers ?? 1) - 1);
      const before = await this.model.countDocuments({
        role: Role.Staff,
        ownerId,
        _id: { $lt: user._id },
      });
      return before < seats;
    }
    return true;
  }

  findStaffOf(id: string, ownerId: string) {
    return this.model.findOne({ _id: id, role: Role.Staff, ownerId });
  }

  /** A customer may only hand their staff Zalo accounts they can use themselves. */
  async assertZaloIdsOwned(ownerId: string, ids?: string[]) {
    if (!ids?.length) return;
    const owner = await this.model.findById(ownerId);
    const mine = new Set(owner?.allowedZaloIds ?? []);
    if (ids.some((z) => !mine.has(z))) {
      throw new ForbiddenException('Có tài khoản Zalo không thuộc quyền của bạn');
    }
  }

  /** Khách hàng (role User) — tài khoản mua gói, tách khỏi Staff/Admin. */
  listCustomers() {
    return this.model.find({ role: Role.User }).sort({ createdAt: -1 });
  }

  async getCustomer(id: string) {
    const user = await this.model.findById(id);
    return user && user.role === Role.User ? user : null;
  }

  async setCustomerActive(id: string, isActive: boolean) {
    const user = await this.getCustomer(id);
    if (!user) return null;
    user.isActive = isActive;
    await user.save();
    return user;
  }

  countCustomers() {
    return this.model.countDocuments({ role: Role.User });
  }

  /** New customer signups per day, oldest first — for the admin dashboard. */
  async customerSignupsByDay(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.model.aggregate<{ _id: string; count: number }>([
      { $match: { role: Role.User, createdAt: { $gte: since.toISOString() } } },
      {
        $group: {
          _id: { $substrCP: ['$createdAt', 0, 10] },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({ date: r._id, count: r.count }));
  }

  async update(
    id: string,
    ownerId: string,
    input: {
      fullName?: string;
      phone?: string;
      isActive?: boolean;
      allowedZaloIds?: string[];
    },
  ) {
    const user = await this.findStaffOf(id, ownerId);
    if (!user) return null;
    if (input.fullName !== undefined) user.fullName = input.fullName.trim();
    if (input.phone !== undefined) user.phone = input.phone.trim();
    if (input.isActive !== undefined) user.isActive = input.isActive;
    if (input.allowedZaloIds !== undefined)
      user.allowedZaloIds = input.allowedZaloIds;
    await user.save();
    return user;
  }

  /** A user grants themselves the Zalo account they just linked/QR-logged-in
   * with, so a non-admin can use what they just created without an admin
   * having to edit their permissions afterwards. */
  async addOwnZaloId(id: string, zaloId: string) {
    await this.model.updateOne(
      { _id: id },
      { $addToSet: { allowedZaloIds: zaloId } },
    );
  }

  async remove(id: string, ownerId: string) {
    const user = await this.findStaffOf(id, ownerId);
    if (!user) return false;
    await user.deleteOne();
    return true;
  }
}
