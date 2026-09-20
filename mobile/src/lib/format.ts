/** Currency and date formatting, in Indian conventions throughout. */

const INR = '₹';

/** Groups digits the Indian way: 12,34,567 rather than 1,234,567. */
export function groupIndian(value: number): string {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(0);
  let result: string;
  if (fixed.length <= 3) {
    result = fixed;
  } else {
    const last3 = fixed.slice(-3);
    const rest = fixed.slice(0, -3);
    result = `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
  }
  return negative ? `-${result}` : result;
}

export function formatCurrency(value: number | null | undefined, options?: { decimals?: boolean; sign?: boolean }): string {
  const amount = Number(value ?? 0);
  const decimals = options?.decimals ?? false;
  const whole = groupIndian(decimals ? Math.trunc(amount) : Math.round(amount));
  const fraction = decimals ? `.${Math.abs(Math.round((amount % 1) * 100)).toString().padStart(2, '0')}` : '';
  const body = `${INR}${whole.replace('-', '')}${fraction}`;
  if (amount < 0) return `-${body}`;
  if (options?.sign && amount > 0) return `+${body}`;
  return body;
}

/** Short form for chart axes and dense tiles: 1.2L, 45.5K. */
export function formatCompact(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}${INR}${(abs / 10000000).toFixed(abs >= 100000000 ? 0 : 1)}Cr`;
  if (abs >= 100000) return `${sign}${INR}${(abs / 100000).toFixed(abs >= 1000000 ? 0 : 1)}L`;
  if (abs >= 1000) return `${sign}${INR}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `${sign}${INR}${Math.round(abs)}`;
}

export function formatPercent(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return '--';
  return `${value >= 0 ? '' : ''}${value.toFixed(decimals)}%`;
}

export function formatSignedPercent(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toISODate(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function formatDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateShort(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatMonthLong(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Today", "Yesterday", or a date, for grouping transaction lists. */
export function relativeDayLabel(iso: string): string {
  const date = parseISODate(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays < 7) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays > -7) return `${Math.abs(diffDays)} days ago`;
  return formatDate(iso);
}

export function dueLabel(days: number | null, overdue: boolean): string {
  if (days === null) return 'No date set';
  if (overdue) return days === -1 ? 'Overdue by 1 day' : `Overdue by ${Math.abs(days)} days`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

export function addMonths(date: Date, delta: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  return next;
}

export function greetingFor(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
