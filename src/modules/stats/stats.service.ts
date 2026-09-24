import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class StatsService {
  constructor(
    private readonly users: UsersService,
    private readonly subs: SubscriptionsService,
  ) {}

  /** Everything the admin dashboard needs, computed from live data (no fake numbers). */
  async overview() {
    const [totalCustomers, byStatus, revenue, byPlan, signups] =
      await Promise.all([
        this.users.countCustomers(),
        this.subs.countByStatus(),
        this.subs.revenueByMonth(6),
        this.subs.activeByPlan(),
        this.users.customerSignupsByDay(30),
      ]);

    const statusMap = Object.fromEntries(byStatus.map((r) => [r._id, r.count]));
    const thisMonth = new Date().toISOString().slice(0, 7);
    const revenueThisMonth =
      revenue.find((r) => r.month === thisMonth)?.total ?? 0;
    const revenueTotal = revenue.reduce((sum, r) => sum + r.total, 0);

    return {
      totalCustomers,
      subscriptions: {
        active: statusMap.active ?? 0,
        pending: statusMap.pending ?? 0,
        expired: statusMap.expired ?? 0,
        cancelled: statusMap.cancelled ?? 0,
      },
      revenue: {
        thisMonth: revenueThisMonth,
        total: revenueTotal,
        byMonth: revenue,
      },
      activeByPlan: byPlan,
      signupsByDay: signups,
    };
  }
}
