export type PricePoint = { months: number; price: number };

export function priceFor(
  prices: PricePoint[],
  months: number,
): number | undefined {
  return prices.find((p) => p.months === months)?.price;
}

export function hasDuplicateMonths(prices: PricePoint[]): boolean {
  return new Set(prices.map((p) => p.months)).size !== prices.length;
}

/** Calendar-month arithmetic (3 months from 31 Jan is 30 Apr, not 2 May). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}
