/**
 * Synthetic test fixtures.
 *
 * These reproduce the shapes found in the department's real workbooks — Arabic
 * headers, repeated header rows, blank separators, Excel date periods, trailing
 * separators, an out-of-range value, multi-day rows, duplicate roster names,
 * missing capacities, manual colours, and written reservations — using entirely
 * invented names and codes. No real institutional data appears here or in any
 * test, and the real workbooks are never committed.
 */

import * as XLSX from "@e965/xlsx";
import { gridFromSheetJs } from "./workbook";
import type { WorkbookGrid } from "./workbook";

export type Cell = string | number | null | { date: string; format: string } | { fill: string; value: string | number };

const SCHEDULE_HEADER = ["المسار", "القسم", "رمز المقرر", "المقرر", "النشاط", "اسم المنسوب", "الشعبة", "الخميس", "الاربعاء", "الثلاثاء", "الاثنين", "الاحد"];

/** Invented faculty names. Any resemblance to real people is unintended. */
export const FIXTURE_NAMES = {
  a: "سالم تجريبي الأول",
  b: "نورة تجريبية الثانية",
  c: "خالد تجريبي الثالث",
  /** Deliberately repeated so duplicate-name handling can be tested. */
  duplicate: "مثال مكرر",
  /** Same person, spelled with an honorific in the schedule sheet. */
  withHonorific: "د. سالم تجريبي الأول",
  /** A near-miss spelling that must not merge automatically. */
  nearMiss: "سالم تجريبي الرابع",
} as const;

function sheetFromRows(rows: Cell[][]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxCol = 0;
  rows.forEach((row, r) => {
    maxCol = Math.max(maxCol, row.length);
    row.forEach((value, c) => {
      if (value === null || value === undefined || value === "") return;
      const ref = XLSX.utils.encode_cell({ r, c });
      if (typeof value === "object" && "date" in value) {
        // Excel stored many period pairs as dates with an m-d number format.
        const date = new Date(`${value.date}T00:00:00.000Z`);
        ws[ref] = { t: "d", v: date, z: value.format, w: `${date.getUTCMonth() + 1}-${date.getUTCDate()}` };
        return;
      }
      if (typeof value === "object" && "fill" in value) {
        ws[ref] = {
          t: typeof value.value === "number" ? "n" : "s",
          v: value.value,
          w: String(value.value),
          s: { patternType: "solid", fgColor: { rgb: value.fill } },
        };
        return;
      }
      ws[ref] = typeof value === "number" ? { t: "n", v: value, w: String(value) } : { t: "s", v: value, w: value };
    });
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: Math.max(0, maxCol - 1) } });
  return ws;
}

export function workbookFromSheets(name: string, sheets: Record<string, Cell[][]>): WorkbookGrid {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, sheetFromRows(rows), sheetName);
  }
  return gridFromSheetJs(name, wb);
}

/* ------------------------------------------------------ schedule sheets */

const D = (date: string) => ({ date, format: "m\\-d" });

/** The 481-shaped sheet: one header, blank separators, every edge case. */
export function originalScheduleRows(): Cell[][] {
  return [
    SCHEDULE_HEADER,
    // Four-activity course. Activity 2 is remote, Activities 3 and 4 use dates.
    ["مسار تجريبي", "قسم تجريبي", "TSTE1201", "لغة تجريبية 1", "نشاط 1", FIXTURE_NAMES.a, "1", null, null, "5-6-7-8", null, null],
    ["مسار تجريبي", "قسم تجريبي", "TSTE1201", "لغة تجريبية 1", "نشاط 2", FIXTURE_NAMES.a, "1", null, "7-8-9-10", null, null, null],
    ["مسار تجريبي", "قسم تجريبي", "TSTE1201", "لغة تجريبية 1", "نشاط 3", FIXTURE_NAMES.a, "1", null, null, null, null, D("2024-01-02")],
    ["مسار تجريبي", "قسم تجريبي", "TSTE1201", "لغة تجريبية 1", "نشاط 4", FIXTURE_NAMES.a, "1", null, null, null, null, D("2024-03-04")],
    [],
    // A repeated header row mid-sheet, exactly as the reviewed sheet does it.
    SCHEDULE_HEADER,
    // Same section number under a different track: the composite identity keeps
    // these apart even though "1" repeats.
    ["مسار آخر", "قسم آخر", "TSTN1301", "لغة تجريبية 1", "نشاط 1", FIXTURE_NAMES.b, "1", null, null, null, "1-2-3-4", null],
    // Trailing separator that normalizes harmlessly.
    ["مسار آخر", "قسم آخر", "TSTN1301", "لغة تجريبية 1", "نشاط 3", FIXTURE_NAMES.b, "1", null, null, "7-8-", null, null],
    // Out of range: 19 is outside the observed 1-12 and must block.
    ["مسار آخر", "قسم آخر", "TSTN1301", "لغة تجريبية 1", "نشاط 4", FIXTURE_NAMES.b, "1", null, null, "9-19", null, null],
    [],
    // A formatting-only row beneath the data: no code, no activity.
    [null, null, null, null, null, "ملاحظة", "26", null, null, null, null, null],
    [],
    // In-person Thursday in the original sheet only.
    ["مسار تجريبي", "قسم تجريبي", "TSTE1201", "لغة تجريبية 1", "نشاط 1", FIXTURE_NAMES.c, "2", "1-2-3-4", null, null, null, null],
    // Remote Thursday, which the department already uses.
    ["مسار تجريبي", "قسم تجريبي", "TSTE1201", "لغة تجريبية 1", "نشاط 2", FIXTURE_NAMES.c, "2", "7-8-9-10", null, null, null, null],
    // Preparatory section with 6 in-person periods plus remote Activity 2.
    ["تاهيلي تجريبي", "قسم تأهيلي", "TSTE1201", "لغة تجريبية 1", "نشاط 1", FIXTURE_NAMES.a, "150", null, null, null, "1-2-3-4", null],
    ["تاهيلي تجريبي", "قسم تأهيلي", "TSTE1201", "لغة تجريبية 1", "نشاط 3", FIXTURE_NAMES.a, "150", null, null, "5-6", null, null],
    ["تاهيلي تجريبي", "قسم تأهيلي", "TSTE1201", "لغة تجريبية 1", "نشاط 2", FIXTURE_NAMES.a, "150", "7-8-9-10", null, null, null, null],
    // Preparatory section that only has a remote meeting: flagged, never invented.
    ["تأهيلي تجريبي", "قسم تأهيلي آخر", "TSTE1201", "لغة تجريبية 1", "نشاط 2", FIXTURE_NAMES.b, "151", null, "7-8-9-10", null, null, null],
    // A row with no faculty member at all.
    ["مسار تجريبي", "قسم تجريبي", "TSTE1201", "لغة تجريبية 1", "نشاط 1", null, "3", null, null, "1-2-3-4", null, null],
  ];
}

/** The 481 مراجعة-shaped sheet: fewer rows, a room-code column, a multi-day row. */
export function reviewedScheduleRows(): Cell[][] {
  return [
    [...SCHEDULE_HEADER, null, null],
    // Same key as the original, but a different faculty spelling (honorific).
    ["مسار تجريبي", "قسم تجريبي", "TSTE1201", "لغة تجريبية 1", "نشاط 1", FIXTURE_NAMES.withHonorific, "1", null, null, "5-6-7-8", null, null, null, null],
    ["مسار تجريبي", "قسم تجريبي", "TSTE1201", "لغة تجريبية 1", "نشاط 2", FIXTURE_NAMES.a, "1", null, "7-8-9-10", null, null, null, null, null],
    // A genuine faculty change on a matched key.
    ["مسار تجريبي", "قسم تجريبي", "TSTE1201", "لغة تجريبية 1", "نشاط 3", FIXTURE_NAMES.c, "1", null, null, null, null, D("2026-01-02"), null, null],
    // Room code entered manually outside the known columns.
    ["مسار تجريبي", "قسم تجريبي", "TSTE1201", "لغة تجريبية 1", "نشاط 4", FIXTURE_NAMES.a, "1", null, null, null, null, D("2026-03-04"), null, "24-0.010"],
    [],
    [...SCHEDULE_HEADER, null, null],
    // One source row carrying meetings on two days.
    ["مسار آخر", "قسم آخر", "TSTN1301", "لغة تجريبية 1", "نشاط 1", FIXTURE_NAMES.b, "1", "11-12", null, null, null, "11-12", null, null],
    ["مسار آخر", "قسم آخر", "TSTN1301", "لغة تجريبية 1", "نشاط 3", FIXTURE_NAMES.b, "1", null, null, "7-8-", null, null, null, null],
    ["مسار آخر", "قسم آخر", "TSTN1301", "لغة تجريبية 1", "نشاط 4", FIXTURE_NAMES.b, "1", null, null, "9-19", null, null, null, null],
    // Only in the reviewed sheet.
    ["مسار ثالث", "قسم ثالث", "TSTG1401", "لغة تجريبية 1", "نشاط 2", FIXTURE_NAMES.c, "7", null, "7-8-9-10", null, null, null, null, null],
    // The same composite key twice, with different faculty: reported, not merged.
    ["مسار ثالث", "قسم ثالث", "TSTG1401", "لغة تجريبية 1", "نشاط 1", FIXTURE_NAMES.a, "8", null, null, "1-2-3-4", null, null, null, null],
    ["مسار ثالث", "قسم ثالث", "TSTG1401", "لغة تجريبية 1", "نشاط 1", FIXTURE_NAMES.b, "8", null, null, "1-2-3-4", null, null, null, null],
  ];
}

const FACULTY_HEADER = ["المجموع الكلي للأعضاء", "المجموع حسب المسمى الوظيفي", "الاسم", "المسمى الوظيفي", "العبء النظامي", "تاهيلي", "اضافية", "انتظام", "اجمالي الساعات"];

/** Roster sheet with grouped blocks, subtotals, duplicates, and an external block. */
export function facultyRows(): Cell[][] {
  return [
    FACULTY_HEADER,
    [1, 1, FIXTURE_NAMES.a, "أستاذ مساعد", 14, 8, 8, 14, 30],
    [2, 2, FIXTURE_NAMES.b, "محاضر", 16, 8, 8, 16, 32],
    // Subtotal row: numbers with no name.
    [null, null, null, null, 30, 16, 16, 30, 62],
    [],
    [3, 1, FIXTURE_NAMES.c, "معلم متقدم", 18, 8, 8, 18, 34],
    [4, 2, FIXTURE_NAMES.duplicate, "معلم ممارس", 18, 4, 4, 18, 26],
    [5, 3, FIXTURE_NAMES.nearMiss, "معلم ممارس", 18, 4, 4, 18, 26],
    [null, null, null, null, 54, 16, 16, 54, 86],
    [],
    ["خارج المعهد", "الكلية-تعاون", "الاسم", "المسمى الوظيفي", "العبء النظامي", "تاهيلي", "اضافية", "انتظام", "اجمالي الساعات"],
    [1, "قسم تجريبي متعاون", FIXTURE_NAMES.duplicate, null, null, 4, 0, 0, 4],
    [2, "قسم تجريبي متعاون", "زائر تجريبي", "محاضر", 16, 4, 0, 16, 20],
    [null, null, null, null, 16, 8, 0, 16, 24],
  ];
}

/* --------------------------------------------------------- room workbook */

const YELLOW = "FFFF00";
const AMBER = "FFC000";
const GREEN = "70AD47";
const RED = "FF0000";

/** Main-group daily grid: capacity, display name, code, periods 1-10, colours. */
export function mainRoomRows(): Cell[][] {
  const periodCells = (fills: string[]) => fills.map((fill, i) => ({ fill, value: i + 1 }));
  return [
    ["السعة", "الاحد", "الكود", "الوقت", null, null, null, null, null, null, null, null, null, "حاسب", "هندسه"],
    [42, "ق201/3", "25-1.033", ...periodCells([YELLOW, YELLOW, YELLOW, YELLOW, GREEN, GREEN, GREEN, GREEN, RED, RED]), 1, 20],
    [49, "ق202/3", "25-1.034", ...periodCells([YELLOW, YELLOW, YELLOW, YELLOW, AMBER, AMBER, AMBER, AMBER, RED, RED]), 2, 21],
    [41, "ق203/3", "25-1.035", ...periodCells([RED, RED, RED, RED, AMBER, AMBER, AMBER, AMBER, GREEN, GREEN]), 3, 22],
  ];
}

/** ق2 grid: no capacity column, and a caption row carrying written reservations. */
export function q2RoomRows(): Cell[][] {
  const periodCells = (fills: string[]) => fills.map((fill, i) => ({ fill, value: i + 1 }));
  return [
    ["24-0.002", ...periodCells([GREEN, GREEN, GREEN, GREEN, AMBER, AMBER, AMBER, AMBER, RED, RED])],
    [null, "إدارة 5", null, "إدارة 6", null, null, null, null, null, null, null],
    ["24-0.003", ...periodCells([GREEN, GREEN, GREEN, GREEN, AMBER, AMBER, AMBER, AMBER, RED, RED])],
    [null, null, null, null, null, null, null, null, null, null, null],
  ];
}

/** The full synthetic student-schedule workbook, mirroring the real sheet names. */
export function scheduleWorkbook(): WorkbookGrid {
  return workbookFromSheets("synthetic-schedule.xlsx", {
    // The real workbook's faculty sheet name starts with a space.
    " اعضاء التدريس1447": facultyRows(),
    "481 مراجعة": reviewedScheduleRows(),
    "481": originalScheduleRows(),
  });
}

/** The full synthetic room workbook, mirroring the real daily sheet names. */
export function roomWorkbook(): WorkbookGrid {
  return workbookFromSheets("synthetic-rooms.xlsx", {
    الاحد: mainRoomRows(),
    الاثنين: mainRoomRows(),
    "ق2 الاحد": q2RoomRows(),
    "ق2 الخميس": q2RoomRows(),
  });
}
