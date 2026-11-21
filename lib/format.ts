/** Pure display formatting shared by server-generated text (Live Updates) and tests. */

const SYMBOL: Record<string, string> = { USD: '$', BDT: '৳', EUR: '€', GBP: '£', INR: '₹' };

/** "$18.47", "$0.003" (more decimals only below one cent), "AED 12.00" for currencies without a symbol. */
export function formatMoney(value: number, currency: string | null | undefined): string {
  const v = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(v);
  const digits = abs > 0 && abs < 0.01 ? 4 : 2;
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits });
  const code = (currency || 'USD').toUpperCase();
  const sym = SYMBOL[code];
  return `${v < 0 ? '-' : ''}${sym ? `${sym}${s}` : `${code} ${s}`}`;
}

/** "2026-11-21" -> "21 Nov". */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
