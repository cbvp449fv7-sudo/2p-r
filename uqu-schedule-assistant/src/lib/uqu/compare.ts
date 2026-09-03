/**
 * Comparison of the original 481 sheet with 481 مراجعة.
 *
 * Neither sheet is treated as authoritative. The comparison only reports what
 * differs; an administrator decides what to keep.
 */

import { assignmentKey, meetingSignature, type ParsedAssignmentRow, type ScheduleParseResult } from "./parse-schedule";
import { nameKey, squash } from "./normalize";

export type ComparisonRecord = {
  key: string;
  /** Which sheet(s) the record appears in. */
  status: "matched" | "only-original" | "only-reviewed";
  /** True for the second and later rows sharing one composite key. */
  duplicate: boolean;
  original: ParsedAssignmentRow | null;
  reviewed: ParsedAssignmentRow | null;
  facultyChanged: boolean;
  /** True when only honorifics or spelling differ, not the person. */
  facultySpellingOnly: boolean;
  timeChanged: boolean;
  roomCodeAdded: boolean;
  /** Administrator decision. Nothing is applied until this is set. */
  decision: "use-original" | "use-reviewed" | "keep-both" | "drop" | "undecided";
};

export type ComparisonSummary = {
  originalRows: number;
  reviewedRows: number;
  originalSections: number;
  reviewedSections: number;
  /** Distinct composite keys present in both sheets. */
  matched: number;
  /** Rows compared, which is higher when a sheet repeats a key. */
  matchedRecords: number;
  onlyOriginal: number;
  onlyReviewed: number;
  facultyChanged: number;
  timeChanged: number;
  roomCodesAdded: number;
  duplicateKeys: { key: string; sheet: string; rows: number[] }[];
};

export type ComparisonResult = { records: ComparisonRecord[]; summary: ComparisonSummary };

function groupByKey(rows: ParsedAssignmentRow[]): Map<string, ParsedAssignmentRow[]> {
  const map = new Map<string, ParsedAssignmentRow[]>();
  for (const row of rows) {
    const key = assignmentKey(row);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return map;
}

export function compareSchedules(original: ScheduleParseResult, reviewed: ScheduleParseResult): ComparisonResult {
  const a = groupByKey(original.rows);
  const b = groupByKey(reviewed.rows);
  const records: ComparisonRecord[] = [];
  const duplicateKeys: ComparisonSummary["duplicateKeys"] = [];

  for (const [key, rows] of a) if (rows.length > 1) duplicateKeys.push({ key, sheet: original.sheet, rows: rows.map((r) => r.ref.row) });
  for (const [key, rows] of b) if (rows.length > 1) duplicateKeys.push({ key, sheet: reviewed.sheet, rows: rows.map((r) => r.ref.row) });

  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of [...keys].sort()) {
    const left = a.get(key) ?? [];
    const right = b.get(key) ?? [];
    // A composite key is normally unique. Where a sheet repeats one, every row
    // is still compared — against the other sheet's first row — so a repeated
    // key surfaces as a changed record rather than silently disappearing.
    const pairs = Math.max(left.length, right.length, 1);
    for (let i = 0; i < pairs; i += 1) {
      const originalRow = left[i] ?? (right.length && left.length ? left[0] : null);
      const reviewedRow = right[i] ?? (left.length && right.length ? right[0] : null);
      const status: ComparisonRecord["status"] = left.length && right.length ? "matched" : left.length ? "only-original" : "only-reviewed";
      const duplicate = i > 0;
      const facultyChanged = Boolean(originalRow && reviewedRow && status === "matched" && squash(originalRow.facultyDisplay) !== squash(reviewedRow.facultyDisplay));
      const facultySpellingOnly = Boolean(
        facultyChanged && originalRow && reviewedRow && nameKey(originalRow.facultyDisplay) === nameKey(reviewedRow.facultyDisplay),
      );
      const timeChanged = Boolean(originalRow && reviewedRow && status === "matched" && meetingSignature(originalRow) !== meetingSignature(reviewedRow));
      const roomCodeAdded = Boolean(reviewedRow?.extras.length && !originalRow?.extras.length);
      records.push({
        key,
        status,
        duplicate,
        original: status === "only-reviewed" ? null : originalRow,
        reviewed: status === "only-original" ? null : reviewedRow,
        facultyChanged,
        facultySpellingOnly,
        timeChanged,
        roomCodeAdded,
        decision: "undecided",
      });
    }
  }

  const summary: ComparisonSummary = {
    originalRows: original.rows.length,
    reviewedRows: reviewed.rows.length,
    originalSections: new Set(original.rows.map((r) => assignmentKey(r).split("|").slice(0, 4).join("|"))).size,
    reviewedSections: new Set(reviewed.rows.map((r) => assignmentKey(r).split("|").slice(0, 4).join("|"))).size,
    matched: records.filter((r) => r.status === "matched" && !r.duplicate).length,
    matchedRecords: records.filter((r) => r.status === "matched").length,
    onlyOriginal: records.filter((r) => r.status === "only-original").length,
    onlyReviewed: records.filter((r) => r.status === "only-reviewed").length,
    facultyChanged: records.filter((r) => r.facultyChanged).length,
    timeChanged: records.filter((r) => r.timeChanged).length,
    roomCodesAdded: records.filter((r) => r.roomCodeAdded).length,
    duplicateKeys,
  };
  return { records, summary };
}

export type MergeStrategy = "original" | "reviewed" | "merge";

/**
 * Resolve a comparison into the rows to import.
 * "merge" keeps the original as the base and lets reviewed records override it,
 * which is the department's stated intent for the review pass.
 */
export function resolveComparison(result: ComparisonResult, strategy: MergeStrategy): ParsedAssignmentRow[] {
  const out: ParsedAssignmentRow[] = [];
  for (const record of result.records) {
    if (record.decision === "drop") continue;
    if (record.decision === "use-original" && record.original) {
      out.push(record.original);
      continue;
    }
    if (record.decision === "use-reviewed" && record.reviewed) {
      out.push(record.reviewed);
      continue;
    }
    if (record.decision === "keep-both") {
      if (record.original) out.push(record.original);
      if (record.reviewed) out.push(record.reviewed);
      continue;
    }
    if (strategy === "original") {
      if (record.duplicate && record.status === "matched") continue;
      if (record.original) out.push(record.original);
    } else if (strategy === "reviewed") {
      if (record.reviewed) out.push(record.reviewed);
    } else if (record.reviewed) {
      out.push(record.reviewed);
    } else if (record.original) {
      out.push(record.original);
    }
  }
  return out.filter(Boolean);
}

/** Counts the administrator sees before confirming a merge strategy. */
export function previewCounts(result: ComparisonResult, strategy: MergeStrategy) {
  const rows = resolveComparison(result, strategy);
  return {
    assignments: rows.length,
    sections: new Set(rows.map((r) => assignmentKey(r).split("|").slice(0, 4).join("|"))).size,
    remote: rows.filter((r) => r.remote).length,
    inPerson: rows.filter((r) => !r.remote).length,
    withoutFaculty: rows.filter((r) => !r.facultyDisplay).length,
    thursdayInPerson: rows.filter((r) => !r.remote && r.meetings.some((m) => m.day === "Thursday")).length,
    invalidPeriods: rows.flatMap((r) => r.meetings).filter((m) => m.error).length,
  };
}
