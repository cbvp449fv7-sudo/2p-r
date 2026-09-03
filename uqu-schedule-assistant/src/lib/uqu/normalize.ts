/**
 * Arabic text normalization and workbook header matching.
 *
 * The department's workbooks are hand-maintained, so the same concept appears
 * with different hamza forms, tatweel, diacritics, and stray whitespace. These
 * helpers fold those variants for comparison only — every raw value is kept
 * alongside its normalized form so nothing is silently rewritten.
 */

const DIACRITICS = /[ً-ْٰـ]/g;

/** Collapse whitespace and trim. Used before anything else. */
export function squash(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

/** Fold Arabic spelling variants so تأهيلي and تاهيلي compare equal. */
export function foldArabic(value: unknown): string {
  return squash(value)
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[‏‎‪-‮]/g, "")
    .toLowerCase();
}

/** True when two Arabic strings are the same once variants are folded. */
export function sameArabic(a: unknown, b: unknown): boolean {
  return foldArabic(a) === foldArabic(b);
}

/** Recognises تاهيلي and تأهيلي anywhere in a track or department name. */
export function isPreparatoryText(value: unknown): boolean {
  return /تاهيلي/.test(foldArabic(value));
}

/** Strip common Arabic honorifics so روster and schedule spellings can be compared. */
export function stripHonorific(value: unknown): string {
  return squash(value).replace(/^(أ\.?\s*د\.?|ا\.?\s*د\.?|د\.?|أ\.?|ا\.?|الأستاذ|الاستاذ|الدكتور|الدكتورة|م\.?)\s+/u, "").trim();
}

/** Comparison key for a person's display name. Never used to merge automatically. */
export function nameKey(value: unknown): string {
  return foldArabic(stripHonorific(value)).replace(/\s+/g, " ");
}

/** Known header spellings for each logical schedule column. */
export const SCHEDULE_HEADERS: Record<string, string[]> = {
  track: ["المسار"],
  department: ["القسم"],
  courseCode: ["رمز المقرر", "رمز المقرّر", "الرمز"],
  courseName: ["المقرر", "المقرّر", "اسم المقرر"],
  activity: ["النشاط"],
  faculty: ["اسم المنسوب", "المنسوب", "اسم عضو هيئة التدريس", "الاسم"],
  section: ["الشعبة", "رقم الشعبة"],
};

export const FACULTY_HEADERS: Record<string, string[]> = {
  name: ["الاسم"],
  jobTitle: ["المسمى الوظيفي", "المسمى الوظيفى"],
  normalLoad: ["العبء النظامي", "العبء النظامى"],
  preparatory: ["تاهيلي", "تأهيلي"],
  additional: ["اضافية", "إضافية"],
  regular: ["انتظام", "إنتظام"],
  total: ["اجمالي الساعات", "إجمالي الساعات", "اجمالى الساعات"],
  groupIndex: ["المجموع حسب المسمى الوظيفي", "المجموع حسب المسمى الوظيفى", "الكلية-تعاون"],
  overallIndex: ["المجموع الكلي للأعضاء", "المجموع الكلي للاعضاء", "خارج المعهد"],
};

export const ROOM_HEADERS: Record<string, string[]> = {
  capacity: ["السعة"],
  displayName: ["القاعة", "اسم القاعة"],
  code: ["الكود"],
  time: ["الوقت"],
};

/** Arabic weekday headings, in the column order the workbooks use. */
export const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"] as const;
export type DayName = (typeof DAY_ORDER)[number];

const DAY_LOOKUP: Record<string, DayName> = {};
for (const [ar, en] of [
  ["الاحد", "Sunday"],
  ["الأحد", "Sunday"],
  ["الاثنين", "Monday"],
  ["الإثنين", "Monday"],
  ["الثلاثاء", "Tuesday"],
  ["الاربعاء", "Wednesday"],
  ["الأربعاء", "Wednesday"],
  ["الخميس", "Thursday"],
] as const) {
  DAY_LOOKUP[foldArabic(ar)] = en as DayName;
}
for (const en of DAY_ORDER) DAY_LOOKUP[en.toLowerCase()] = en;

/** Map an Arabic or English weekday label to the canonical English day. */
export function toDayName(value: unknown): DayName | null {
  const folded = foldArabic(value);
  if (DAY_LOOKUP[folded]) return DAY_LOOKUP[folded];
  for (const [key, day] of Object.entries(DAY_LOOKUP)) {
    if (key && folded.includes(key)) return day;
  }
  return null;
}

export const DAY_AR: Record<DayName, string> = {
  Sunday: "الأحد",
  Monday: "الاثنين",
  Tuesday: "الثلاثاء",
  Wednesday: "الأربعاء",
  Thursday: "الخميس",
};

/** Match a cell value against a set of known header spellings. */
export function matchHeader(value: unknown, candidates: string[]): boolean {
  const folded = foldArabic(value);
  if (!folded) return false;
  return candidates.some((c) => foldArabic(c) === folded);
}

/** Resolve a header row into logical column indexes (1-based). */
export function mapHeaderRow(cells: unknown[], spec: Record<string, string[]>): Record<string, number> {
  const map: Record<string, number> = {};
  cells.forEach((cell, index) => {
    for (const [key, candidates] of Object.entries(spec)) {
      if (map[key] === undefined && matchHeader(cell, candidates)) map[key] = index + 1;
    }
  });
  return map;
}

/** Convert a 1-based column index to its spreadsheet letter. */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Sheet roles the dedicated 1448 importer recognises, after trimming. */
export type SheetRole =
  | "faculty"
  | "schedule-original"
  | "schedule-reviewed"
  | "rooms-main"
  | "rooms-q2"
  | "unknown";

export function detectSheetRole(sheetName: string): { role: SheetRole; day?: DayName } {
  const trimmed = squash(sheetName);
  const folded = foldArabic(trimmed);
  if (/اعضاء\s*التدريس/.test(folded)) return { role: "faculty" };
  if (/^481\s*مراجعه$/.test(folded)) return { role: "schedule-reviewed" };
  if (/^481$/.test(folded)) return { role: "schedule-original" };
  const isQ2 = /^ق\s*2\b/.test(trimmed) || /^ق2/.test(folded);
  const day = toDayName(isQ2 ? trimmed.replace(/^ق\s*2\s*/, "") : trimmed);
  if (day) return { role: isQ2 ? "rooms-q2" : "rooms-main", day };
  return { role: "unknown" };
}
