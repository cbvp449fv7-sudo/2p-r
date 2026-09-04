/**
 * Parser for the 481 and 481 مراجعة scheduling sheets.
 *
 * Both sheets repeat their header row for every block, separate blocks with
 * blank rows, and occasionally carry formatting-only or partially filled rows.
 * Every source row is kept — rows that cannot be understood are returned as
 * anomalies rather than dropped.
 */

import type { SourceRef } from "../types";
import { REMOTE_ACTIVITY } from "../types";
import {
  DAY_ORDER,
  type DayName,
  columnLetter,
  foldArabic,
  isPreparatoryText,
  mapHeaderRow,
  SCHEDULE_HEADERS,
  squash,
  toDayName,
} from "./normalize";
import { parsePeriods, type PeriodParse } from "./periods";
import type { SheetGrid } from "./workbook";

export type ParsedMeeting = {
  day: DayName;
  periods: number[];
  display: string;
  normalizations: string[];
  error: string | null;
  ref: SourceRef;
};

export type ParsedAssignmentRow = {
  /** Stable identity of the workbook row these meetings came from. */
  sourceRowId: string;
  ref: SourceRef;
  track: string;
  department: string;
  courseCode: string;
  courseName: string;
  activity: string;
  facultyDisplay: string;
  sectionNumber: string;
  preparatory: boolean;
  remote: boolean;
  meetings: ParsedMeeting[];
  /** Values found outside the known columns, e.g. manually entered room codes. */
  extras: { value: string; ref: SourceRef }[];
  raw: Record<string, string>;
};

export type ScheduleAnomaly = {
  ref: SourceRef;
  raw: string[];
  reason: string;
};

export type ScheduleParseResult = {
  workbook: string;
  sheet: string;
  headerRows: number[];
  rows: ParsedAssignmentRow[];
  anomalies: ScheduleAnomaly[];
  blankRows: number;
  /** Every meeting whose period value could not be trusted. */
  invalidPeriods: ParsedMeeting[];
};

function ref(workbook: string, sheet: string, row: number, column: number): SourceRef {
  return { workbook, sheet, row, column: columnLetter(column) };
}

function isHeaderRow(values: string[]): boolean {
  return values.some((v) => foldArabic(v) === foldArabic("المسار")) && values.some((v) => foldArabic(v) === foldArabic("القسم"));
}

export function parseScheduleSheet(workbook: string, grid: SheetGrid): ScheduleParseResult {
  const rows: ParsedAssignmentRow[] = [];
  const anomalies: ScheduleAnomaly[] = [];
  const headerRows: number[] = [];
  const invalidPeriods: ParsedMeeting[] = [];
  let blankRows = 0;
  let columns: Record<string, number> = {};
  let dayColumns: { column: number; day: DayName }[] = [];
  let knownColumns = new Set<number>();

  for (let r = 1; r <= grid.rows; r += 1) {
    const values = grid.rowValues(r);
    if (values.every((v) => v === "")) {
      blankRows += 1;
      continue;
    }
    if (isHeaderRow(values)) {
      headerRows.push(r);
      columns = mapHeaderRow(values, SCHEDULE_HEADERS);
      dayColumns = [];
      values.forEach((value, index) => {
        const day = toDayName(value);
        if (day) dayColumns.push({ column: index + 1, day });
      });
      knownColumns = new Set([...Object.values(columns), ...dayColumns.map((d) => d.column)]);
      continue;
    }
    if (!Object.keys(columns).length) {
      anomalies.push({ ref: ref(workbook, grid.name, r, 1), raw: values, reason: "Row appears before any recognised header row." });
      continue;
    }

    const at = (key: string) => (columns[key] ? grid.cell(r, columns[key]).display : "");
    const track = at("track");
    const department = at("department");
    const courseCode = at("courseCode");
    const courseName = at("courseName");
    const activity = at("activity");
    const facultyDisplay = at("faculty");
    const sectionNumber = at("section");

    const meetings: ParsedMeeting[] = [];
    for (const { column, day } of dayColumns) {
      const cell = grid.cell(r, column);
      if (!cell.display) continue;
      const parsed: PeriodParse = parsePeriods(cell.display);
      const meeting: ParsedMeeting = {
        day,
        periods: parsed.periods,
        display: parsed.display,
        normalizations: parsed.normalizations,
        error: parsed.error,
        ref: ref(workbook, grid.name, r, column),
      };
      meetings.push(meeting);
      if (parsed.error) invalidPeriods.push(meeting);
    }

    const extras: { value: string; ref: SourceRef }[] = [];
    for (let c = 1; c <= grid.columns; c += 1) {
      if (knownColumns.has(c)) continue;
      const cell = grid.cell(r, c);
      if (cell.display) extras.push({ value: cell.display, ref: ref(workbook, grid.name, r, c) });
    }

    if (!courseCode || !activity) {
      anomalies.push({
        ref: ref(workbook, grid.name, r, 1),
        raw: values,
        reason: !courseCode && !activity
          ? "Row has neither a course code nor an activity; it is kept for review and never imported silently."
          : !courseCode
            ? "Row has an activity but no course code."
            : "Row has a course code but no activity.",
      });
      continue;
    }

    rows.push({
      sourceRowId: `${grid.name}#${r}`,
      ref: ref(workbook, grid.name, r, 1),
      track,
      department,
      courseCode,
      courseName,
      activity,
      facultyDisplay,
      sectionNumber,
      preparatory: isPreparatoryText(track) || isPreparatoryText(department),
      remote: squash(activity) === REMOTE_ACTIVITY || foldArabic(activity) === foldArabic(REMOTE_ACTIVITY),
      meetings,
      extras,
      raw: {
        track,
        department,
        courseCode,
        courseName,
        activity,
        faculty: facultyDisplay,
        section: sectionNumber,
        ...Object.fromEntries(DAY_ORDER.map((d) => [d, meetings.find((m) => m.day === d)?.display ?? ""])),
      },
    });
  }

  return { workbook, sheet: grid.name, headerRows, rows, anomalies, blankRows, invalidPeriods };
}

/** Composite identity of a section. A section number alone is not unique. */
export function sectionKey(row: Pick<ParsedAssignmentRow, "track" | "department" | "courseCode" | "sectionNumber">): string {
  return [foldArabic(row.track), foldArabic(row.department), squash(row.courseCode).toUpperCase(), squash(row.sectionNumber)].join("|");
}

/** Composite identity of an assignment: the section identity plus its activity. */
export function assignmentKey(row: Pick<ParsedAssignmentRow, "track" | "department" | "courseCode" | "sectionNumber" | "activity">): string {
  return `${sectionKey(row)}|${foldArabic(row.activity)}`;
}

/** Stable text for a row's scheduled time, used when comparing sheets. */
export function meetingSignature(row: Pick<ParsedAssignmentRow, "meetings">): string {
  return row.meetings
    .map((m) => `${m.day}:${[...m.periods].sort((a, b) => a - b).join("-")}`)
    .sort()
    .join(" | ");
}

/** Total periods a row occupies across all of its days. */
export function rowPeriodCount(row: Pick<ParsedAssignmentRow, "meetings">): number {
  return row.meetings.reduce((n, m) => n + m.periods.length, 0);
}
