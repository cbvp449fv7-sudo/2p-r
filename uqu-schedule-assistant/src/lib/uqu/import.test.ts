import { describe, expect, it } from "vitest";
import { detectSheetRole, foldArabic, isPreparatoryText, nameKey, sameArabic, squash, toDayName } from "./normalize";
import { parsePeriods, isMonthDayFormat, periodLabelAr, MAX_PERIOD } from "./periods";
import { parseScheduleSheet, assignmentKey, sectionKey, meetingSignature, rowPeriodCount } from "./parse-schedule";
import { parseFacultySheet } from "./parse-faculty";
import { parseRoomWorkbook } from "./parse-rooms";
import { compareSchedules, previewCounts, resolveComparison } from "./compare";
import { buildAliases, candidatesFor, similarity, unresolvedAliases } from "./aliases";
import { inferPatterns, patternFor } from "./patterns";
import { buildFromImport, facultyFromRoster, importPreview } from "./build";
import { FIXTURE_NAMES, roomWorkbook, scheduleWorkbook } from "./fixtures";
import { defaultPeriodTable } from "../period-table";
import { createDemoData } from "../demo";

const wb = scheduleWorkbook();
const original = parseScheduleSheet("synthetic-schedule.xlsx", wb.sheet("481")!);
const reviewed = parseScheduleSheet("synthetic-schedule.xlsx", wb.sheet("481 مراجعة")!);
const roster = parseFacultySheet("synthetic-schedule.xlsx", wb.sheet(" اعضاء التدريس1447")!);
const rooms = parseRoomWorkbook("synthetic-rooms.xlsx", roomWorkbook());

describe("Arabic normalization", () => {
  it("folds hamza and taa marbuta variants", () => {
    expect(sameArabic("تأهيلي", "تاهيلي")).toBe(true);
    expect(sameArabic("الأربعاء", "الاربعاء")).toBe(true);
    expect(foldArabic("  كلية   الهندسة ")).toBe(foldArabic("كليه الهندسه"));
  });

  it("recognizes both preparatory spellings", () => {
    expect(isPreparatoryText("تاهيلي حاسب")).toBe(true);
    expect(isPreparatoryText("تأهيلي هندسة")).toBe(true);
    expect(isPreparatoryText("كلية الهندسة")).toBe(false);
  });

  it("trims whitespace from values and sheet names", () => {
    expect(squash("  a   b  ")).toBe("a b");
    expect(detectSheetRole(" اعضاء التدريس1447").role).toBe("faculty");
    expect(detectSheetRole("481").role).toBe("schedule-original");
    expect(detectSheetRole(" 481 مراجعة ").role).toBe("schedule-reviewed");
  });

  it("detects the weekday sheets in both room groups", () => {
    expect(detectSheetRole("الاحد")).toEqual({ role: "rooms-main", day: "Sunday" });
    expect(detectSheetRole("ق2 الخميس")).toEqual({ role: "rooms-q2", day: "Thursday" });
    expect(toDayName("الأربعاء")).toBe("Wednesday");
  });

  it("strips honorifics for comparison only", () => {
    expect(nameKey("د. سالم تجريبي")).toBe(nameKey("سالم تجريبي"));
  });
});

describe("period parsing", () => {
  it("reads Excel date-formatted pairs as period numbers", () => {
    expect(isMonthDayFormat("m\\-d")).toBe(true);
    const cell = wb.sheet("481")!.cell(4, 12);
    expect(cell.isDate).toBe(true);
    expect(cell.display).toBe("1-2");
    expect(parsePeriods(cell.display).periods).toEqual([1, 2]);
  });

  it("reads 3-4 as periods 3 and 4, not a calendar date", () => {
    expect(parsePeriods("3-4").periods).toEqual([3, 4]);
    expect(parsePeriods("5-6-7-8").periods).toEqual([5, 6, 7, 8]);
    expect(parsePeriods("9-10-11-12").periods).toEqual([9, 10, 11, 12]);
  });

  it("normalizes harmless trailing separators and reports the change", () => {
    const result = parsePeriods("7-8-");
    expect(result.periods).toEqual([7, 8]);
    expect(result.error).toBeNull();
    expect(result.normalizations.join(" ")).toContain("Trailing");
    expect(parsePeriods("5-6-").periods).toEqual([5, 6]);
  });

  it("blocks a value outside the observed range instead of guessing", () => {
    const result = parsePeriods("9-19");
    expect(result.error).toContain("19");
    expect(result.error).toContain(String(MAX_PERIOD));
    // It is never silently rewritten to 9-10.
    expect(result.periods).not.toEqual([9, 10]);
  });

  it("rejects non-numeric tokens", () => {
    expect(parsePeriods("24-0.010").error).toBeTruthy();
  });

  it("labels periods in Arabic until clock times exist", () => {
    expect(periodLabelAr([5, 6, 7, 8])).toBe("الفترة 5–8");
  });
});

describe("schedule sheet parsing", () => {
  it("skips repeated header rows and blank separators without losing data", () => {
    expect(original.headerRows.length).toBeGreaterThanOrEqual(2);
    expect(original.blankRows).toBeGreaterThan(0);
    expect(original.rows.length).toBe(14);
  });

  it("keeps a formatting-only row as a reviewable anomaly rather than dropping it", () => {
    expect(original.anomalies.length).toBe(1);
    expect(original.anomalies[0].reason).toContain("never imported silently");
  });

  it("records the workbook, sheet, row, column, raw and normalized value", () => {
    const row = original.rows[2];
    expect(row.ref.workbook).toBe("synthetic-schedule.xlsx");
    expect(row.ref.sheet).toBe("481");
    const meeting = row.meetings[0];
    expect(meeting.ref.column).toBe("L");
    expect(meeting.display).toBe("1-2");
    expect(meeting.periods).toEqual([1, 2]);
  });

  it("splits a multi-day source row while keeping its shared row identity", () => {
    const multi = reviewed.rows.find((r) => r.meetings.length > 1);
    expect(multi).toBeDefined();
    expect(multi!.meetings.map((m) => m.day).sort()).toEqual(["Sunday", "Thursday"]);
    expect(new Set(multi!.meetings.map(() => multi!.sourceRowId)).size).toBe(1);
  });

  it("flags missing faculty without discarding the row", () => {
    expect(original.rows.filter((r) => !r.facultyDisplay).length).toBe(1);
  });

  it("uses a composite identity so a section number alone is not unique", () => {
    const a = original.rows.find((r) => r.track === "مسار تجريبي" && r.sectionNumber === "1")!;
    const b = original.rows.find((r) => r.track === "مسار آخر" && r.sectionNumber === "1")!;
    expect(sectionKey(a)).not.toBe(sectionKey(b));
    expect(assignmentKey(a)).toContain(foldArabic(a.activity));
  });

  it("marks Activity 2 as remote and everything else as in person", () => {
    expect(original.rows.filter((r) => r.remote).every((r) => r.activity === "نشاط 2")).toBe(true);
    expect(original.rows.some((r) => r.remote)).toBe(true);
  });

  it("recognizes both preparatory spellings on the track", () => {
    expect(original.rows.filter((r) => r.preparatory).length).toBeGreaterThan(0);
  });

  it("captures manually entered room codes outside the known columns", () => {
    const withRoom = reviewed.rows.find((r) => r.extras.length);
    expect(withRoom?.extras[0].value).toBe("24-0.010");
    expect(withRoom?.extras[0].ref.column).toBe("N");
  });

  it("counts only one in-person Thursday meeting in the original sheet", () => {
    const thursday = original.rows.filter((r) => r.meetings.some((m) => m.day === "Thursday"));
    expect(thursday.filter((r) => !r.remote).length).toBe(1);
    expect(thursday.filter((r) => r.remote).length).toBe(2);
  });
});

describe("sheet comparison", () => {
  const comparison = compareSchedules(original, reviewed);

  it("reports matched, single-sheet, and changed records", () => {
    expect(comparison.summary.matched).toBeGreaterThan(0);
    expect(comparison.summary.onlyOriginal).toBeGreaterThan(0);
    expect(comparison.summary.onlyReviewed).toBeGreaterThan(0);
    expect(comparison.summary.facultyChanged).toBeGreaterThan(0);
    expect(comparison.summary.roomCodesAdded).toBe(1);
  });

  it("separates a spelling difference from a genuine faculty change", () => {
    const spelling = comparison.records.find((r) => r.facultySpellingOnly);
    expect(spelling?.original?.facultyDisplay).toBe(FIXTURE_NAMES.a);
    expect(spelling?.reviewed?.facultyDisplay).toBe(FIXTURE_NAMES.withHonorific);
    const genuine = comparison.records.find((r) => r.facultyChanged && !r.facultySpellingOnly);
    expect(genuine).toBeDefined();
  });

  it("reports a repeated composite key rather than merging the rows", () => {
    expect(comparison.summary.duplicateKeys.length).toBe(1);
    expect(comparison.summary.duplicateKeys[0].rows.length).toBe(2);
  });

  it("treats neither sheet as authoritative", () => {
    const useOriginal = previewCounts(comparison, "original");
    const useReviewed = previewCounts(comparison, "reviewed");
    const merged = previewCounts(comparison, "merge");
    expect(useOriginal.assignments).toBe(original.rows.length);
    expect(useReviewed.assignments).toBe(reviewed.rows.length);
    expect(merged.assignments).toBeGreaterThanOrEqual(Math.max(useOriginal.assignments, useReviewed.assignments));
  });

  it("honours a per-record decision over the chosen strategy", () => {
    const withDecision = {
      ...comparison,
      records: comparison.records.map((r, i) => (i === 0 ? { ...r, decision: "drop" as const } : r)),
    };
    expect(resolveComparison(withDecision, "original").length).toBe(resolveComparison(comparison, "original").length - 1);
  });
});

describe("faculty roster parsing", () => {
  it("separates internal from external records and skips subtotal rows", () => {
    expect(roster.internal).toBe(5);
    expect(roster.external).toBe(2);
    expect(roster.subtotalRows.length).toBe(3);
  });

  it("preserves local job titles verbatim", () => {
    const titles = roster.rows.map((r) => r.jobTitle);
    expect(titles).toContain("معلم متقدم");
    expect(titles).toContain("معلم ممارس");
  });

  it("computes the total as preparatory plus additional plus regular", () => {
    const person = roster.rows[0];
    expect(person.totalComputed).toBe((person.preparatory ?? 0) + (person.additional ?? 0) + (person.regular ?? 0));
    expect(roster.totalMismatches).toEqual([]);
  });

  it("gives repeated display names separate identities", () => {
    const duplicates = roster.rows.filter((r) => r.name === FIXTURE_NAMES.duplicate);
    expect(duplicates.length).toBe(2);
    expect(duplicates[0].id).not.toBe(duplicates[1].id);
    expect(roster.duplicateNames.length).toBe(1);
  });

  it("lets an explicit workbook load override the rank default", () => {
    const built = facultyFromRoster(roster.rows);
    const lecturer = built.find((f) => f.jobTitleAr === "محاضر" && f.workbookLoads);
    expect(lecturer?.explicitLoads).toBe(true);
    expect(lecturer?.workbookLoads?.additional).toBe(8);
    // اضافية stays an additional-program category, separate from overtime.
    expect(lecturer?.workbookLoads?.total).toBe(32);
  });
});

describe("faculty alias resolution", () => {
  const aliases = buildAliases(
    [...original.rows, ...reviewed.rows].filter((r) => r.facultyDisplay).map((r) => ({ display: r.facultyDisplay, ref: r.ref })),
    roster.rows,
  );

  it("resolves an exact match once honorifics are stripped", () => {
    const resolved = aliases.find((a) => a.display === FIXTURE_NAMES.withHonorific);
    expect(resolved?.status).toBe("resolved");
  });

  it("never merges two roster rows that share a display name", () => {
    const options = candidatesFor(FIXTURE_NAMES.duplicate, roster.rows);
    expect(options.length).toBe(2);
    const alias = buildAliases([{ display: FIXTURE_NAMES.duplicate, ref: roster.rows[0].ref }], roster.rows)[0];
    expect(alias.status).toBe("ambiguous");
    expect(alias.facultyId).toBeNull();
    expect(unresolvedAliases([alias])).toHaveLength(1);
  });

  it("does not merge a near-miss spelling automatically", () => {
    expect(similarity(FIXTURE_NAMES.a, FIXTURE_NAMES.nearMiss)).toBeLessThan(1);
    const alias = buildAliases([{ display: "سالم تجريبي الخامس", ref: roster.rows[0].ref }], roster.rows)[0];
    expect(alias.status).not.toBe("resolved");
  });
});

describe("course pattern inference", () => {
  const patterns = inferPatterns(original.rows);

  it("infers the observed duration for each course and activity", () => {
    expect(patternFor(patterns, "TSTE1201", "نشاط 1")?.periods).toBe(4);
    expect(patternFor(patterns, "TSTE1201", "نشاط 2")?.periods).toBe(4);
    expect(patternFor(patterns, "TSTE1201", "نشاط 3")?.periods).toBe(2);
    expect(patternFor(patterns, "TSTE1201", "نشاط 4")?.periods).toBe(2);
  });

  it("marks Activity 2 patterns as remote", () => {
    expect(patternFor(patterns, "TSTE1201", "نشاط 2")?.deliveryMode).toBe("remote");
    expect(patternFor(patterns, "TSTE1201", "نشاط 1")?.deliveryMode).toBe("in-person");
  });

  it("starts unconfirmed so nothing is hidden from the administrator", () => {
    expect(patterns.every((p) => !p.confirmed && p.source === "inferred")).toBe(true);
  });
});

describe("room workbook parsing", () => {
  it("imports codes, display names, groups, and capacities", () => {
    expect(rooms.rooms.length).toBe(5);
    const main = rooms.rooms.find((r) => r.code === "25-1.033");
    expect(main?.capacity).toBe(42);
    expect(main?.displayName).toBe("ق201/3");
  });

  it("leaves ق2 rooms with an unknown capacity", () => {
    const q2 = rooms.rooms.filter((r) => r.group === "ق2");
    expect(q2.length).toBe(2);
    expect(q2.every((r) => r.capacity === null && r.capacityUnknown)).toBe(true);
  });

  it("covers periods 1 to 10 in the physical grids", () => {
    expect(rooms.maxGridPeriod).toBe(10);
  });

  it("reports every distinct fill colour without guessing a meaning", () => {
    expect(rooms.colors.length).toBeGreaterThanOrEqual(4);
    expect(rooms.colors.every((c) => c.meaning === "unmapped")).toBe(true);
    expect(rooms.colors[0].samples.length).toBeGreaterThan(0);
  });

  it("imports written reservations as reviewable entries with their source cell", () => {
    expect(rooms.textReservations.length).toBeGreaterThan(0);
    const reservation = rooms.textReservations[0];
    expect(reservation.text).toContain("إدارة");
    expect(reservation.ref.sheet).toContain("ق2");
  });
});

describe("building application records", () => {
  const base = createDemoData();
  const aliases = buildAliases(
    original.rows.filter((r) => r.facultyDisplay).map((r) => ({ display: r.facultyDisplay, ref: r.ref })),
    roster.rows,
  ).map((a) => (a.status === "resolved" ? a : { ...a, facultyId: roster.rows[0].id, status: "resolved" as const }));

  const result = buildFromImport({
    rows: original.rows,
    roster: roster.rows,
    aliases,
    rooms: rooms.rooms,
    roomEntries: rooms.entries,
    colorProfile: null,
    mappings: [{ track: "مسار تجريبي", department: "قسم تجريبي", collegeIds: ["COL-DEMO-LANG"], confirmed: true }],
    colleges: base.colleges,
    patterns: inferPatterns(original.rows),
    settings: { periods: defaultPeriodTable() },
  });

  it("never gives a remote meeting a room", () => {
    expect(result.assignments.filter((a) => a.deliveryMode === "remote").every((a) => a.roomId === null)).toBe(true);
  });

  it("blocks the out-of-range row and records why, instead of skipping it silently", () => {
    expect(result.blocked.length).toBe(1);
    expect(result.blocked[0].reason).toContain("19");
    const blockedRow = result.sourceRows.find((r) => r.status === "blocked");
    expect(blockedRow?.note).toContain("19");
  });

  it("keeps one source row entry for every parsed row", () => {
    expect(result.sourceRows.length).toBe(original.rows.length);
  });

  it("maps confirmed track and department pairs to a college and flags the rest", () => {
    const preview = importPreview(result);
    expect(preview.unmappedColleges).toBeGreaterThan(0);
    expect(result.assignments.some((a) => a.collegeIds?.includes("COL-DEMO-LANG"))).toBe(true);
  });

  it("carries the source cell onto each imported meeting", () => {
    expect(result.assignments.every((a) => a.sourceRef && a.sourceRowId)).toBe(true);
  });

  it("computes weekly period totals per row", () => {
    expect(rowPeriodCount(original.rows[0])).toBe(4);
    expect(meetingSignature(original.rows[0])).toContain("Tuesday");
  });
});
