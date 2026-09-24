import { CreatePlanDto } from './dto/create-plan.dto';

/**
 * Inserted only when the collection is empty. Same offer as the landing page.
 * NOTE: the 3- and 6-month prices were inferred from the 12-month price on the
 * landing page (see the TODO there) — confirm them, then edit via the admin API.
 */
export const DEFAULT_PLANS: CreatePlanDto[] = [
  {
    code: 'personal',
    name: 'Personal',
    tagline: 'Gói cá nhân',
    description: 'Dành cho cá nhân, shop online, freelancer.',
    prices: [
      { months: 3, price: 750000 },
      { months: 6, price: 1500000 },
      { months: 12, price: 2000000 },
    ],
    maxUsers: 1,
    features: [
      '1 tài khoản sử dụng',
      'Truy cập toàn bộ tính năng',
      'Cập nhật miễn phí',
      'Hỗ trợ kỹ thuật trong giờ hành chính',
    ],
    sortOrder: 1,
  },
  {
    code: 'business',
    name: 'Business',
    tagline: 'Gói doanh nghiệp',
    description: 'Dành cho team sale, marketing, doanh nghiệp.',
    prices: [
      { months: 3, price: 1800000 },
      { months: 6, price: 3600000 },
      { months: 12, price: 5400000 },
    ],
    maxUsers: 4,
    features: [
      '1 tài khoản tổng quản lý (Admin)',
      'Tạo thêm 3 tài khoản nhân sự',
      'Tổng cộng 4 tài khoản sử dụng',
      'Phân quyền & quản lý tập trung',
      'Hỗ trợ kỹ thuật ưu tiên 24/7',
      'Onboarding 1–1 cho đội ngũ',
    ],
    isPopular: true,
    sortOrder: 2,
  },
];

/** Hidden 30-day trial: admin grants it to a customer, it is never listed or bought. */
export const TRIAL_PLAN: CreatePlanDto = {
  code: 'trial',
  name: 'Trial',
  tagline: 'Dùng thử 30 ngày',
  description: 'Gói dùng thử miễn phí do quản trị viên cấp.',
  prices: [{ months: 1, price: 0 }],
  maxUsers: 1,
  features: ['1 tài khoản sử dụng', 'Truy cập toàn bộ tính năng', 'Dùng thử 30 ngày'],
  isPublic: false,
  durationDays: 30,
  sortOrder: 99,
};
