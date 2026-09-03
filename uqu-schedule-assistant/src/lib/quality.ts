/**
 * Data Quality Center.
 *
 * One place that runs before generation, approval, and export. Every issue
 * carries a severity, a category, its source cell where one exists, and a link
 * that opens the affected record.
 */

import type { AppData, QualityIssue, QualitySeverity } from "./types";
import { UNCLASSIFIED_COLLEGE_ID } from "./types";
import { allConflicts } from "./engine";
import { loadSummary } from "./rules";
import { isPreparatorySection, isRemote, preparatorySummary, remoteRoomViolation, thursdayCheck, travelConflicts } from "./schedule-rules";
import { collegesForAssignment } from "./colleges";
import { MAX_PERIOD, MIN_PERIOD } from "./uqu/periods";
import { patternFor } from "./uqu/patterns";
import { nameKey } from "./uqu/normalize";

export const QUALITY_CATEGORIES = [
  "invalid-period",
  "missing-faculty",
  "missing-capacity",
  "duplicate-faculty-name",
  "unresolved-alias",
  "unmapped-college",
  "preparatory-hours",
  "remote-room",
  "thursday-in-person",
  "missing-pattern",
  "room-conflict",
  "faculty-load",
  "single-sheet-record",
  "unmapped-room-color",
] as const;

export type QualityCategory = (typeof QUALITY_CATEGORIES)[number];

export type QualityReport = {
  issues: QualityIssue[];
  counts: Record<QualitySeverity, number>;
  byCategory: Record<string, number>;
  blocking: boolean;
  ranAt: string;
};

function issue(
  id: string,
  category: QualityCategory,
  severity: QualitySeverity,
  messageEn: string,
  messageAr: string,
  entity: QualityIssue["entity"],
  extra: Partial<QualityIssue> = {},
): QualityIssue {
  return { id, category, severity, messageEn, messageAr, entity, ...extra };
}

export function runQualityChecks(data: AppData): QualityReport {
  const issues: QualityIssue[] = [];

  for (const assignment of data.assignments) {
    const periods = assignment.periods ?? [];
    const bad = periods.filter((p) => p < MIN_PERIOD || p > MAX_PERIOD);
    if (bad.length) {
      issues.push(
        issue(
          `period-${assignment.id}`,
          "invalid-period",
          "error",
          `${assignment.id} uses period ${bad.join(", ")}, outside the observed range ${MIN_PERIOD}–${MAX_PERIOD}.`,
          `${assignment.id} يستخدم الفترة ${bad.join("، ")} خارج النطاق ${MIN_PERIOD}–${MAX_PERIOD}.`,
          { kind: "assignment", id: assignment.id },
          { ref: assignment.sourceRef, link: `/editor?assignment=${assignment.id}` },
        ),
      );
    }

    if (!assignment.facultyId) {
      issues.push(
        issue(
          `faculty-${assignment.id}`,
          "missing-faculty",
          "error",
          `${assignment.id} has no faculty member assigned.`,
          `${assignment.id} بدون عضو هيئة تدريس.`,
          { kind: "assignment", id: assignment.id },
          { ref: assignment.sourceRef, link: `/editor?assignment=${assignment.id}` },
        ),
      );
    }

    const remoteRoom = remoteRoomViolation(assignment);
    if (remoteRoom) {
      issues.push(
        issue(
          `remote-room-${assignment.id}`,
          "remote-room",
          "error",
          remoteRoom,
          `${assignment.id}: نشاط 2 يُقدَّم عن بُعد ولا يجوز إسناد قاعة له.`,
          { kind: "assignment", id: assignment.id },
          { ref: assignment.sourceRef, link: `/editor?assignment=${assignment.id}` },
        ),
      );
    }

    const thursday = thursdayCheck(assignment, data.settings);
    if (thursday.inPerson) {
      issues.push(
        issue(
          `thursday-${assignment.id}`,
          "thursday-in-person",
          thursday.requiresReason ? "error" : "warning",
          `${assignment.id}: ${thursday.message}`,
          `${assignment.id}: تدريس حضوري يوم الخميس${thursday.requiresReason ? " بدون سبب مسجّل." : "."}`,
          { kind: "assignment", id: assignment.id },
          { ref: assignment.sourceRef, link: `/editor?assignment=${assignment.id}` },
        ),
      );
    }

    if (assignment.activity && !patternFor(data.coursePatterns, assignment.courseCode, assignment.activity)) {
      issues.push(
        issue(
          `pattern-${assignment.courseCode}-${assignment.activity}`,
          "missing-pattern",
          "warning",
          `No confirmed template for ${assignment.courseCode} ${assignment.activity}.`,
          `لا يوجد نموذج معتمد للمقرر ${assignment.courseCode} ${assignment.activity}.`,
          { kind: "course", id: assignment.courseCode },
          { link: `/import-1448?step=patterns` },
        ),
      );
    }

    const colleges = collegesForAssignment(data, assignment);
    if (!colleges.length || colleges.includes(UNCLASSIFIED_COLLEGE_ID)) {
      issues.push(
        issue(
          `college-${assignment.id}`,
          "unmapped-college",
          colleges.length ? "warning" : "error",
          colleges.length
            ? `${assignment.id} is filed under غير مصنف.`
            : `${assignment.id} has no college mapping for ${assignment.track ?? "?"} / ${assignment.department ?? "?"}.`,
          colleges.length ? `${assignment.id} مصنّف ضمن غير مصنف.` : `${assignment.id} بدون ربط بكلية.`,
          { kind: "assignment", id: assignment.id },
          { link: `/colleges` },
        ),
      );
    }
  }

  for (const room of data.rooms) {
    if (room.capacity === null) {
      issues.push(
        issue(
          `capacity-${room.id}`,
          "missing-capacity",
          "warning",
          `Room ${room.id} has an unknown capacity and cannot be used under a capacity constraint.`,
          `القاعة ${room.id} بدون سعة معروفة.`,
          { kind: "room", id: room.id },
          { ref: room.sourceRef, link: `/rooms?room=${room.id}` },
        ),
      );
    }
    for (const cell of room.grid ?? []) {
      if (cell.meaning === "unmapped" && cell.color) {
        issues.push(
          issue(
            `color-${cell.color}`,
            "unmapped-room-color",
            "warning",
            `Room colour ${cell.color} has no assigned meaning.`,
            `لون القاعة ${cell.color} بدون معنى محدد.`,
            { kind: "room", id: room.id },
            { ref: cell.ref, link: `/import-1448?step=colors` },
          ),
        );
      }
    }
  }

  const byName = new Map<string, string[]>();
  for (const person of data.faculty) {
    const key = nameKey(person.nameAr || person.nameEn);
    byName.set(key, [...(byName.get(key) ?? []), person.id]);
  }
  for (const [, ids] of byName) {
    if (ids.length > 1) {
      issues.push(
        issue(
          `dupe-${ids.join("-")}`,
          "duplicate-faculty-name",
          "warning",
          `${ids.length} roster records share a display name (${ids.join(", ")}). They are kept separate and are never merged automatically.`,
          `${ids.length} سجلات تحمل الاسم نفسه ولم يتم دمجها تلقائياً.`,
          { kind: "faculty", id: ids[0] },
          { link: `/faculty?duplicates=1` },
        ),
      );
    }
  }

  for (const alias of data.facultyAliases) {
    if (alias.status !== "resolved" || !alias.facultyId) {
      issues.push(
        issue(
          `alias-${alias.id}`,
          "unresolved-alias",
          "error",
          `Schedule name "${alias.display}" is not confirmed against a roster record.`,
          `الاسم "${alias.display}" غير مطابق لسجل معتمد.`,
          { kind: "faculty", id: alias.id },
          { ref: alias.sourceRefs[0], link: `/import-1448?step=aliases` },
        ),
      );
    }
  }

  for (const section of data.sections) {
    if (!isPreparatorySection(section)) continue;
    const summary = preparatorySummary(section.id, data.assignments, data.settings);
    if (!summary.withinRange) {
      issues.push(
        issue(
          `prep-${section.id}`,
          "preparatory-hours",
          "warning",
          summary.message as string,
          `الشعبة التأهيلية ${section.id}: ${summary.inPersonPeriods} فترة حضورية خارج النطاق ${data.settings.preparatoryMinPeriods}–${data.settings.preparatoryMaxPeriods}.`,
          { kind: "section", id: section.id },
          { ref: section.sourceRef, link: `/courses?section=${section.id}` },
        ),
      );
    }
  }

  for (const conflict of allConflicts(data)) {
    if (conflict.type === "thursday" || conflict.type === "remote-room" || conflict.type === "faculty-missing") continue;
    issues.push(
      issue(
        `conflict-${conflict.type}-${conflict.assignmentId}`,
        "room-conflict",
        "error",
        conflict.message,
        conflict.message,
        { kind: "assignment", id: conflict.assignmentId },
        { link: `/editor?assignment=${conflict.assignmentId}` },
      ),
    );
  }

  for (const person of data.faculty) {
    const summary = loadSummary(person, data.assignments, data.settings);
    if (summary.overtime > 0) {
      issues.push(
        issue(
          `overload-${person.id}`,
          "faculty-load",
          "warning",
          `${person.nameEn} is ${summary.overtime} units above the effective load of ${summary.limit}.`,
          `${person.nameAr} يتجاوز العبء بمقدار ${summary.overtime} وحدة.`,
          { kind: "faculty", id: person.id },
          { link: `/faculty-schedule?faculty=${person.id}` },
        ),
      );
    } else if (summary.assigned > 0 && summary.underload > 0) {
      issues.push(
        issue(
          `underload-${person.id}`,
          "faculty-load",
          "info",
          `${person.nameEn} is ${summary.underload} units below the effective load of ${summary.limit}.`,
          `${person.nameAr} أقل من العبء بمقدار ${summary.underload} وحدة.`,
          { kind: "faculty", id: person.id },
          { link: `/faculty-schedule?faculty=${person.id}` },
        ),
      );
    }
    for (const travel of travelConflicts(data, data.assignments, person.id)) {
      issues.push(
        issue(
          `travel-${travel.assignmentId}-${travel.otherId}`,
          "room-conflict",
          travel.hard ? "error" : "warning",
          travel.message,
          travel.message,
          { kind: "assignment", id: travel.assignmentId },
          { link: `/editor?assignment=${travel.assignmentId}` },
        ),
      );
    }
  }

  for (const row of data.sourceRows) {
    if (row.status === "blocked") {
      issues.push(
        issue(
          `source-${row.id}`,
          "single-sheet-record",
          "error",
          `Source row ${row.ref.sheet}!${row.ref.row} was not imported: ${row.note ?? "reason not recorded"}.`,
          `الصف ${row.ref.sheet}!${row.ref.row} لم يُستورد: ${row.note ?? "بدون سبب مسجل"}.`,
          { kind: "import", id: row.id },
          { ref: row.ref, link: `/quality?row=${row.id}` },
        ),
      );
    }
  }

  const deduped = Array.from(new Map(issues.map((i) => [i.id, i])).values());
  const counts: Record<QualitySeverity, number> = { error: 0, warning: 0, info: 0 };
  const byCategory: Record<string, number> = {};
  for (const item of deduped) {
    counts[item.severity] += 1;
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  }

  return { issues: deduped, counts, byCategory, blocking: counts.error > 0, ranAt: new Date().toISOString() };
}

/** Filter helper backing the report's category, severity, and text filters. */
export function filterIssues(
  issues: QualityIssue[],
  filters: { category?: string; severity?: string; sheet?: string; text?: string },
): QualityIssue[] {
  const text = (filters.text ?? "").trim().toLowerCase();
  return issues.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.severity && item.severity !== filters.severity) return false;
    if (filters.sheet && item.ref?.sheet !== filters.sheet) return false;
    if (text && !`${item.messageEn} ${item.messageAr} ${item.entity.id}`.toLowerCase().includes(text)) return false;
    return true;
  });
}

/** Plain-text report an administrator can save alongside the schedule. */
export function qualityReportText(report: QualityReport): string {
  const lines = [
    `UQU Schedule Assistant — validation report`,
    `Generated: ${report.ranAt}`,
    `Blocking errors: ${report.counts.error}  Warnings: ${report.counts.warning}  Information: ${report.counts.info}`,
    "",
  ];
  for (const item of report.issues) {
    const where = item.ref ? ` [${item.ref.sheet}!${item.ref.column}${item.ref.row}]` : "";
    lines.push(`${item.severity.toUpperCase()}\t${item.category}\t${item.entity.kind}:${item.entity.id}${where}\t${item.messageEn}`);
  }
  return lines.join("\n");
}

export { isRemote };
