/**
 * Per-college Excel export.
 *
 * Each college receives its own workbook containing only its own schedule. A
 * college workbook never exposes another college's assignments or rooms, a
 * faculty member's work in unrelated colleges, or private workload figures.
 */

import type { AppData, Assignment } from "./types";
import { UNCLASSIFIED_COLLEGE_ID } from "./types";
import { buildWorkbook, type CellValue, type SheetSpec } from "./xlsx-writer";
import { createZip, safeFilename, type ZipEntry } from "./zip";
import { collegeName, collegeSlice, collegesForAssignment } from "./colleges";
import { clockTimesComplete, periodsToRange } from "./period-table";
import { DAY_AR, type DayName } from "./uqu/normalize";
import { isRemote, roomLabel } from "./schedule-rules";
import { periodLabelAr } from "./uqu/periods";
import { runQualityChecks } from "./quality";

const SHEETS = {
  summary: "ملخص",
  unified: "الجدول الموحد",
  byDepartment: "جداول الأقسام",
  sections: "جداول الشعب",
  rooms: "القاعات المستخدمة",
  notes: "ملاحظات",
} as const;

const UNIFIED_HEADERS = [
  "المسار",
  "القسم",
  "رمز المقرر",
  "اسم المقرر",
  "النشاط",
  "الشعبة",
  "عضو هيئة التدريس",
  "اليوم",
  "الفترة / الوقت",
  "القاعة",
  "شعبة مشتركة",
];

const UNIFIED_WIDTHS = [22, 24, 14, 28, 12, 12, 26, 12, 22, 16, 14];

function timeText(data: AppData, assignment: Assignment): string {
  const periods = assignment.periods ?? [];
  if (!periods.length) return `${assignment.start}–${assignment.end}`;
  if (!clockTimesComplete(data.settings)) return periodLabelAr(periods);
  const range = periodsToRange(data.settings, periods);
  return range ? `${range.start}–${range.end}` : periodLabelAr(periods);
}

function unifiedRow(data: AppData, assignment: Assignment): CellValue[] {
  const course = data.courses.find((c) => c.code === assignment.courseCode);
  const section = data.sections.find((s) => s.id === assignment.sectionId);
  const person = data.faculty.find((f) => f.id === assignment.facultyId);
  const shared = collegesForAssignment(data, assignment).length > 1;
  return [
    assignment.track ?? section?.track ?? "",
    assignment.department ?? section?.department ?? "",
    assignment.courseCode,
    course?.nameAr ?? course?.nameEn ?? "",
    assignment.activity ?? "",
    section?.sectionNumber ?? assignment.sectionId,
    person?.nameAr ?? person?.nameEn ?? "غير محدد",
    DAY_AR[assignment.day as DayName] ?? assignment.day,
    timeText(data, assignment),
    roomLabel(assignment, "ar"),
    shared ? "مشترك" : "",
  ];
}

export type CollegeExport = {
  collegeId: string;
  filename: string;
  bytes: Uint8Array;
  assignmentCount: number;
  summary: {
    sections: number;
    assignments: number;
    remote: number;
    inPerson: number;
    shared: number;
    warnings: number;
  };
};

export function buildCollegeWorkbook(data: AppData, collegeId: string): CollegeExport {
  const slice = collegeSlice(data, collegeId);
  const nameAr = collegeName(data.colleges, collegeId, "ar");
  const version = data.versions.find((v) => v.id === data.approvedVersionId);
  const versionLabel = version?.name ?? `مسودة — الإصدار ${data.settings.scheduleVersionNumber}`;
  const exportDate = new Date().toISOString().slice(0, 10);

  const report = runQualityChecks(data);
  const ownIds = new Set(slice.assignments.map((a) => a.id));
  const ownWarnings = report.issues.filter((i) => i.entity.kind === "assignment" && ownIds.has(i.entity.id));

  const remote = slice.assignments.filter(isRemote);
  const summary = {
    sections: slice.sections.length,
    assignments: slice.assignments.length,
    remote: remote.length,
    inPerson: slice.assignments.length - remote.length,
    shared: slice.shared.length,
    warnings: ownWarnings.length,
  };

  const summarySheet: SheetSpec = {
    name: SHEETS.summary,
    rows: [
      ["البند", "القيمة"],
      ["الكلية", nameAr],
      ["الفصل الدراسي", data.settings.semester],
      ["إصدار الجدول", versionLabel],
      ["رقم الإصدار", data.settings.scheduleVersionNumber],
      ["تاريخ التصدير", exportDate],
      ["حالة الجدول", data.scheduleState],
      ["عدد الشعب", summary.sections],
      ["عدد اللقاءات المجدولة", summary.assignments],
      ["اللقاءات عن بُعد", summary.remote],
      ["اللقاءات الحضورية", summary.inPerson],
      ["الشعب المشتركة", summary.shared],
      ["التنبيهات المتبقية", summary.warnings],
    ],
    columnWidths: [28, 40],
    freezeHeader: true,
    printArea: true,
  };

  const unifiedSheet: SheetSpec = {
    name: SHEETS.unified,
    rows: [UNIFIED_HEADERS, ...slice.assignments.map((a) => unifiedRow(data, a))],
    columnWidths: UNIFIED_WIDTHS,
    freezeHeader: true,
    filter: true,
    printArea: true,
  };

  const departments = [...new Set(slice.assignments.map((a) => a.department ?? "غير محدد"))].sort((a, b) => a.localeCompare(b, "ar"));
  const departmentSheet: SheetSpec = {
    name: SHEETS.byDepartment,
    rows: [
      ["القسم", "عدد الشعب", "عدد اللقاءات", "عن بُعد", "حضوري"],
      ...departments.map((dept) => {
        const own = slice.assignments.filter((a) => (a.department ?? "غير محدد") === dept);
        const ownRemote = own.filter(isRemote).length;
        return [dept, new Set(own.map((a) => a.sectionId)).size, own.length, ownRemote, own.length - ownRemote] as CellValue[];
      }),
    ],
    columnWidths: [30, 14, 14, 12, 12],
    freezeHeader: true,
    filter: true,
    printArea: true,
  };

  const sectionSheet: SheetSpec = {
    name: SHEETS.sections,
    rows: [
      ["الشعبة", "المسار", "القسم", "رمز المقرر", "عدد اللقاءات", "الفترات الحضورية", "فترات عن بُعد", "تأهيلي"],
      ...slice.sections.map((section) => {
        const own = slice.assignments.filter((a) => a.sectionId === section.id);
        const inPerson = own.filter((a) => !isRemote(a)).reduce((n, a) => n + (a.periods?.length ?? 0), 0);
        const remotePeriods = own.filter(isRemote).reduce((n, a) => n + (a.periods?.length ?? 0), 0);
        return [
          section.sectionNumber ?? section.id,
          section.track ?? "",
          section.department ?? "",
          section.courseCode ?? "",
          own.length,
          inPerson,
          remotePeriods,
          section.preparatory ? "نعم" : "لا",
        ] as CellValue[];
      }),
    ],
    columnWidths: [14, 22, 24, 14, 14, 18, 16, 10],
    freezeHeader: true,
    filter: true,
    printArea: true,
  };

  // Only the rooms this college's own in-person meetings actually use.
  const roomSheet: SheetSpec = {
    name: SHEETS.rooms,
    rows: [
      ["رمز القاعة", "الاسم المعروض", "المبنى", "السعة", "عدد اللقاءات"],
      ...slice.rooms.map((room) => {
        const uses = slice.assignments.filter((a) => a.roomId === room.id).length;
        return [room.code ?? room.id, room.displayName ?? room.id, room.building, room.capacity === null ? "غير معروفة" : room.capacity, uses] as CellValue[];
      }),
    ],
    columnWidths: [16, 18, 22, 14, 14],
    freezeHeader: true,
    filter: true,
    printArea: true,
  };

  const thursdayNotes = slice.assignments
    .filter((a) => a.day === "Thursday" && !isRemote(a))
    .map((a) => ["الخميس حضوري", a.courseCode, a.sectionId, a.thursdayReason ?? "بدون سبب مسجّل"] as CellValue[]);
  const overrideNotes = slice.assignments
    .filter((a) => a.overrideReason)
    .map((a) => ["استثناء معتمد", a.courseCode, a.sectionId, a.overrideReason as string] as CellValue[]);
  const sharedNotes = slice.shared.map(
    (a) =>
      [
        "شعبة مشتركة",
        a.courseCode,
        a.sectionId,
        `مرتبطة باللقاء الرئيسي ${a.masterAssignmentId ?? a.id} ومشتركة مع: ${collegesForAssignment(data, a)
          .filter((id) => id !== collegeId)
          .map((id) => collegeName(data.colleges, id, "ar"))
          .join("، ")}`,
      ] as CellValue[],
  );
  const warningNotes = ownWarnings.map((issue) => ["تنبيه", issue.category, issue.entity.id, issue.messageAr] as CellValue[]);

  const notesSheet: SheetSpec = {
    name: SHEETS.notes,
    rows: [["النوع", "المقرر / التصنيف", "الشعبة / السجل", "التفاصيل"], ...thursdayNotes, ...overrideNotes, ...sharedNotes, ...warningNotes],
    columnWidths: [18, 24, 20, 70],
    freezeHeader: true,
    filter: true,
    printArea: true,
  };

  const bytes = buildWorkbook({
    rtl: true,
    title: `${nameAr} — ${data.settings.semester}`,
    creator: data.settings.operatorName,
    sheets: [summarySheet, unifiedSheet, departmentSheet, sectionSheet, roomSheet, notesSheet],
  });

  const filename = `${safeFilename(`جداول ${nameAr} ${data.settings.semester} الإصدار ${data.settings.scheduleVersionNumber}`)}.xlsx`;

  return { collegeId, filename, bytes, assignmentCount: slice.assignments.length, summary };
}

/** Colleges that currently hold at least one assignment. */
export function exportableColleges(data: AppData): string[] {
  const ids = new Set<string>();
  for (const assignment of data.assignments) {
    const own = collegesForAssignment(data, assignment);
    for (const id of own.length ? own : [UNCLASSIFIED_COLLEGE_ID]) ids.add(id);
  }
  return [...ids];
}

export type BulkExportGate = { allowed: boolean; reason: string; unmapped: number };

/** Bulk export is blocked while any assignment has no college at all. */
export function bulkExportGate(data: AppData): BulkExportGate {
  const unmapped = data.assignments.filter((a) => collegesForAssignment(data, a).length === 0).length;
  if (!unmapped) return { allowed: true, reason: "", unmapped: 0 };
  return {
    allowed: false,
    reason: `${unmapped} assignment(s) have no college mapping. Map their track and department, or file them explicitly under غير مصنف, before exporting.`,
    unmapped,
  };
}

export function buildAllColleges(data: AppData): { exports: CollegeExport[]; zip: Uint8Array; filename: string } {
  const exports = exportableColleges(data).map((id) => buildCollegeWorkbook(data, id));
  const entries: ZipEntry[] = exports.map((item) => ({ name: item.filename, data: item.bytes }));
  const filename = `${safeFilename(`جداول جميع الكليات ${data.settings.semester} الإصدار ${data.settings.scheduleVersionNumber}`)}.zip`;
  return { exports, zip: createZip(entries), filename };
}
