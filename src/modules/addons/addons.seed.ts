import { CreateAddonDto } from './dto/create-addon.dto';

/** Same table as the landing page ("Mua thêm tài khoản nhân sự"). */
export const DEFAULT_ADDONS: CreateAddonDto[] = [
  {
    code: 'staff-1',
    name: '+1 tài khoản nhân sự',
    seats: 1,
    prices: [
      { months: 3, price: 450000 },
      { months: 6, price: 800000 },
      { months: 12, price: 1400000 },
    ],
    sortOrder: 1,
  },
  {
    code: 'staff-3',
    name: '+3 tài khoản nhân sự',
    seats: 3,
    prices: [
      { months: 3, price: 1200000 },
      { months: 6, price: 2100000 },
      { months: 12, price: 3600000 },
    ],
    sortOrder: 2,
  },
  {
    code: 'staff-5',
    name: '+5 tài khoản nhân sự',
    seats: 5,
    prices: [
      { months: 3, price: 1800000 },
      { months: 6, price: 3000000 },
      { months: 12, price: 5000000 },
    ],
    sortOrder: 3,
  },
];
