import { Category, Person } from './types';

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function daysBetween(a: Date, b: Date) {
  const ams = a?.getTime?.();
  const bms = b?.getTime?.();
  if (!Number.isFinite(ams) || !Number.isFinite(bms)) return 0;
  const ms = Math.abs((ams as number) - (bms as number));
  return ms / (1000 * 60 * 60 * 24);
}

// Signed day difference: positive when `a` is after `b`.
export function daysSince(a: Date, b: Date) {
  const ams = a?.getTime?.();
  const bms = b?.getTime?.();
  if (!Number.isFinite(ams) || !Number.isFinite(bms)) return 0;
  return ((ams as number) - (bms as number)) / (1000 * 60 * 60 * 24);
}

export function categoryTimeLimitDays(category: Category) {
  const v = Math.max(1, category.timeLimitValue);
  return category.timeLimitUnit === 'months' ? v * 30 : v;
}

// Returns 0..1 where 1.0 = far left (danger), 0.0 = far right (recent)
export function horizontalRatio(person: Person, category: Category): number {
  const now = new Date();
  const lastMs = Date.parse(person.lastInteraction as any);
  if (!Number.isFinite(lastMs)) return 0; // treat invalid as now (far right)
  const last = new Date(lastMs);
  // Clamp future dates to 0 days ago.
  const deltaDays = Math.max(0, daysSince(now, last));
  const limit = Math.max(1, categoryTimeLimitDays(category));
  const ratio = deltaDays / limit;
  return ratio; // can exceed 1.0 when overdue
}

export function ratioToPercent(ratio: number) {
  const n = ratio * 100;
  if (!Number.isFinite(n)) return 50;
  return clamp(n, 0, 100);
}

export function xPercentFromPerson(p: Person, c: Category) {
  // 0% = far right, 100% = far left
  const r = horizontalRatio(p, c);
  const percent = ratioToPercent(r);
  const x = 100 - percent; // invert so 100% at far right
  return clamp(x, 0, 100);
}

// Shared viewport padding so axis ticks and bubble centers align
export const VIEWPORT_PAD_LEFT = 12; // matches DangerZone width (in % of viewport width)
// Increase this to create more space on the right side (for the wand)
export const VIEWPORT_PAD_RIGHT = 14; // was 6; percent of viewport width
export const WAND_RING_OFFSET_PX = 84; // distance from right edge to wand ring center

// Map a 0..100 percentage (0 left, 100 right) into full-screen percent with paddings
export function mapToViewportPercent(
  percentRight: number,
  leftPad: number = VIEWPORT_PAD_LEFT,
  rightPad: number = VIEWPORT_PAD_RIGHT
) {
  const p = clamp(percentRight, 0, 100) / 100;
  const width = 100 - leftPad - rightPad;
  return clamp(leftPad + width * p, 0, 100);
}

export function uid(prefix = '') {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function isClient() {
  return typeof window !== 'undefined';
}

export function formatDateISO(d: Date) {
  return d.toISOString();
}
