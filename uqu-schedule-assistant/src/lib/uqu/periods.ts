/**
 * Period parsing for the 1448 workbooks.
 *
 * Weekday cells hold values such as "5-6-7-8". Excel silently converted many of
 * them to dates with an m-d number format, so a cell that reads "1-2" on screen
 * is stored as a date whose month is 1 and day is 2. The displayed month-day
 * pair is the period pair — never a calendar date and never a serial number.
 */

import { squash } from "./normalize";

export const MIN_PERIOD = 1;
export const MAX_PERIOD = 12;

export type PeriodParse = {
  /** What the cell shows in Excel, after date-format interpretation. */
  display: string;
  periods: number[];
  /** Human-readable normalizations that were applied, for the import preview. */
  normalizations: string[];
  /** Set when the value cannot be trusted; import must block on it. */
  error: string | null;
};

/** Render a cell's stored value the way Excel displays it. */
export function displayValue(value: unknown, numberFormat?: string): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (isMonthDayFormat(numberFormat)) return `${value.getMonth() + 1}-${value.getDate()}`;
    return `${value.getMonth() + 1}-${value.getDate()}`;
  }
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return squash(value);
}

/** True for the m-d family of number formats Excel applied to period pairs. */
export function isMonthDayFormat(format?: string): boolean {
  if (!format) return false;
  const cleaned = format.replace(/\\/g, "").replace(/"/g, "").toLowerCase();
  return /^m{1,2}\s*-\s*d{1,2}$/.test(cleaned) || /^d{1,2}\s*-\s*m{1,2}$/.test(cleaned);
}

/**
 * Parse a displayed weekday cell into period numbers.
 * Harmless trailing separators are normalized and reported. Anything outside
 * the observed 1-12 range, or any non-numeric token, produces a blocking error
 * rather than a guess.
 */
export function parsePeriods(display: string): PeriodParse {
  const normalizations: string[] = [];
  const original = display;
  let text = squash(display).replace(/[‐-―]/g, "-").replace(/[،,/\\]/g, "-");
  if (!text) return { display: original, periods: [], normalizations, error: null };

  const trimmed = text.replace(/[-\s]+$/g, "").replace(/^[-\s]+/g, "");
  if (trimmed !== text) {
    normalizations.push(`Trailing or leading separator removed: "${text}" → "${trimmed}"`);
    text = trimmed;
  }
  const collapsed = text.replace(/-{2,}/g, "-");
  if (collapsed !== text) {
    normalizations.push(`Repeated separators collapsed: "${text}" → "${collapsed}"`);
    text = collapsed;
  }

  const tokens = text.split(/[-\s]+/).filter(Boolean);
  const periods: number[] = [];
  const bad: string[] = [];
  const outOfRange: number[] = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      bad.push(token);
      continue;
    }
    const n = Number(token);
    if (n < MIN_PERIOD || n > MAX_PERIOD) outOfRange.push(n);
    periods.push(n);
  }

  if (bad.length) {
    return {
      display: original,
      periods,
      normalizations,
      error: `Value "${original}" contains text that is not a period number (${bad.join(", ")}). Review it manually.`,
    };
  }
  if (outOfRange.length) {
    return {
      display: original,
      periods,
      normalizations,
      error: `Period ${outOfRange.join(", ")} in "${original}" is outside the observed range ${MIN_PERIOD}–${MAX_PERIOD}. Correct it manually; it is never repaired automatically.`,
    };
  }
  const duplicates = periods.filter((p, i) => periods.indexOf(p) !== i);
  if (duplicates.length) {
    return {
      display: original,
      periods,
      normalizations,
      error: `Period ${[...new Set(duplicates)].join(", ")} appears more than once in "${original}".`,
    };
  }
  return { display: original, periods, normalizations, error: null };
}

/** Contiguous span check used when confirming course patterns. */
export function isContiguous(periods: number[]): boolean {
  if (periods.length < 2) return true;
  const sorted = [...periods].sort((a, b) => a - b);
  return sorted.every((p, i) => i === 0 || p === sorted[i - 1] + 1);
}

/** Arabic label used until real clock times are configured. */
export function periodLabelAr(periods: number[]): string {
  if (!periods.length) return "";
  const sorted = [...periods].sort((a, b) => a - b);
  return sorted.length === 1 ? `الفترة ${sorted[0]}` : `الفترة ${sorted[0]}–${sorted[sorted.length - 1]}`;
}

export function periodLabelEn(periods: number[]): string {
  if (!periods.length) return "";
  const sorted = [...periods].sort((a, b) => a - b);
  return sorted.length === 1 ? `Period ${sorted[0]}` : `Periods ${sorted[0]}–${sorted[sorted.length - 1]}`;
}
