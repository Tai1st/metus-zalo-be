import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { LinkPlansService } from './link-plans.service';

type PublicPlan = {
  code: string;
  name: string;
  description: string;
  limit: number;
  period: 'day' | 'week' | 'month';
  prices: { months: number; price: number }[];
  currency: string;
  maxCustomDomains: number;
};

/**
 * Bảng giá công khai cho trang chủ (không cần đăng nhập). Chỉ trả các gói đang bán và đúng những trường
 * cần để hiển thị, không lộ id, danh sách tên miền hệ thống hay trường nội bộ khác.
 */
@ApiTags('link-plans')
@Public()
@SkipThrottle()
@Controller('public/link-plans')
export class LinkPlansPublicController {
  constructor(private readonly plans: LinkPlansService) {}

  @Get()
  async list(): Promise<PublicPlan[]> {
    const rows = await this.plans.listActive();
    return rows.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      limit: p.limit,
      period: p.period,
      prices: (p.prices ?? []).map((x) => ({ months: x.months, price: x.price })),
      currency: p.currency,
      maxCustomDomains: p.maxCustomDomains ?? 0,
    }));
  }
}
