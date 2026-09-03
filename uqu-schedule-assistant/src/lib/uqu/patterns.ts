/**
 * Course and activity pattern inference.
 *
 * Durations are read out of the workbook rather than assumed, shown to the
 * administrator during import, and saved as editable templates once confirmed.
 */

import type { CoursePattern, DeliveryMode } from "../types";
import { REMOTE_ACTIVITY } from "../types";
import { foldArabic, squash } from "./normalize";
import { rowPeriodCount, type ParsedAssignmentRow } from "./parse-schedule";

export type PatternObservation = CoursePattern & {
  /** Every distinct duration seen, so disagreement is visible. */
  durations: { periods: number; count: number }[];
  conflicting: boolean;
};

export function inferPatterns(rows: ParsedAssignmentRow[]): PatternObservation[] {
  const buckets = new Map<string, { courseCode: string; activity: string; counts: Map<number, number>; remote: boolean }>();
  for (const row of rows) {
    const periods = rowPeriodCount(row);
    if (!periods) continue;
    const code = squash(row.courseCode).toUpperCase();
    const activity = squash(row.activity);
    const key = `${code}|${foldArabic(activity)}`;
    const bucket = buckets.get(key) ?? { courseCode: code, activity, counts: new Map<number, number>(), remote: row.remote };
    bucket.counts.set(periods, (bucket.counts.get(periods) ?? 0) + 1);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => {
      const durations = [...bucket.counts.entries()].map(([periods, count]) => ({ periods, count })).sort((a, b) => b.count - a.count || a.periods - b.periods);
      const observations = durations.reduce((n, d) => n + d.count, 0);
      const deliveryMode: DeliveryMode = foldArabic(bucket.activity) === foldArabic(REMOTE_ACTIVITY) ? "remote" : "in-person";
      return {
        courseCode: bucket.courseCode,
        activity: bucket.activity,
        periods: durations[0]?.periods ?? 0,
        deliveryMode,
        observations,
        confirmed: false,
        source: "inferred" as const,
        durations,
        conflicting: durations.length > 1,
      };
    })
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.activity.localeCompare(b.activity));
}

/** Look up the expected duration for a course/activity pair. */
export function patternFor(patterns: CoursePattern[], courseCode: string, activity: string): CoursePattern | undefined {
  const code = squash(courseCode).toUpperCase();
  return patterns.find((p) => squash(p.courseCode).toUpperCase() === code && foldArabic(p.activity) === foldArabic(activity));
}
