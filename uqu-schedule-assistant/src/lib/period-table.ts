/**
 * Period definitions and their optional clock times.
 *
 * The workbooks schedule by period number, not by clock time. Until the
 * department supplies real times the app displays الفترة 1 through الفترة 12
 * and calendar export stays disabled. Nominal times still exist so overlap
 * checks have a single uniform representation.
 */

import type { PeriodSlot, Settings } from "./types";
import { MAX_PERIOD } from "./uqu/periods";

const NOMINAL_START_MINUTES = 8 * 60;
const NOMINAL_LENGTH = 50;

export function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function clockToMinutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Unconfirmed nominal slots, used for overlap maths only. */
export function defaultPeriodTable(): PeriodSlot[] {
  return Array.from({ length: MAX_PERIOD }, (_, i) => {
    const start = NOMINAL_START_MINUTES + i * NOMINAL_LENGTH;
    return { period: i + 1, start: minutesToClock(start), end: minutesToClock(start + NOMINAL_LENGTH), confirmed: false };
  });
}

export function periodSlot(settings: Pick<Settings, "periods">, period: number): PeriodSlot | undefined {
  return settings.periods.find((p) => p.period === period);
}

/** True once every period in use carries a confirmed clock time. */
export function clockTimesComplete(settings: Pick<Settings, "periods">): boolean {
  return settings.periods.length > 0 && settings.periods.every((p) => p.confirmed && p.start && p.end);
}

export function missingClockTimes(settings: Pick<Settings, "periods">): number[] {
  return settings.periods.filter((p) => !p.confirmed).map((p) => p.period);
}

/** Clock span covered by a set of periods. */
export function periodsToRange(settings: Pick<Settings, "periods">, periods: number[]): { start: string; end: string } | null {
  if (!periods.length) return null;
  const sorted = [...periods].sort((a, b) => a - b);
  const first = periodSlot(settings, sorted[0]);
  const last = periodSlot(settings, sorted[sorted.length - 1]);
  if (!first || !last) return null;
  return { start: first.start, end: last.end };
}
