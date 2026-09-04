/**
 * Version and scenario comparison.
 *
 * Differences are reported with text and icons as well as colour, so the report
 * stays readable in print and for colour-blind readers.
 */

import type { Assignment, ScheduleState } from "./types";

export type ChangeType = "added" | "removed" | "faculty" | "time" | "day" | "room" | "delivery" | "lock" | "college" | "approval";

export const CHANGE_ICONS: Record<ChangeType, string> = {
  added: "+",
  removed: "−",
  faculty: "👤",
  time: "⏱",
  day: "📅",
  room: "🚪",
  delivery: "🌐",
  lock: "🔒",
  college: "🏛",
  approval: "✔",
};

export const CHANGE_LABELS: Record<ChangeType, { en: string; ar: string }> = {
  added: { en: "Added", ar: "مضاف" },
  removed: { en: "Removed", ar: "محذوف" },
  faculty: { en: "Faculty changed", ar: "تغيّر عضو التدريس" },
  time: { en: "Time changed", ar: "تغيّر الوقت" },
  day: { en: "Day changed", ar: "تغيّر اليوم" },
  room: { en: "Room changed", ar: "تغيّرت القاعة" },
  delivery: { en: "Delivery mode changed", ar: "تغيّر نمط التقديم" },
  lock: { en: "Lock status changed", ar: "تغيّرت حالة القفل" },
  college: { en: "College changed", ar: "تغيّرت الكلية" },
  approval: { en: "Approval state changed", ar: "تغيّرت حالة الاعتماد" },
};

export type FieldChange = { field: ChangeType; before: string; after: string };

export type DiffRow = {
  assignmentId: string;
  courseCode: string;
  sectionId: string;
  facultyId: string;
  types: ChangeType[];
  changes: FieldChange[];
};

export type DiffResult = {
  rows: DiffRow[];
  counts: Record<ChangeType, number>;
  stateChange: FieldChange | null;
};

const periodText = (a: Assignment) => (a.periods?.length ? a.periods.join(", ") : `${a.start}–${a.end}`);

export function diffSchedules(
  before: Assignment[],
  after: Assignment[],
  states?: { before: ScheduleState; after: ScheduleState },
): DiffResult {
  const beforeById = new Map(before.map((a) => [a.id, a]));
  const afterById = new Map(after.map((a) => [a.id, a]));
  const rows: DiffRow[] = [];
  const counts = Object.fromEntries(Object.keys(CHANGE_ICONS).map((k) => [k, 0])) as Record<ChangeType, number>;

  const push = (assignment: Assignment, types: ChangeType[], changes: FieldChange[]) => {
    for (const type of types) counts[type] += 1;
    rows.push({
      assignmentId: assignment.id,
      courseCode: assignment.courseCode,
      sectionId: assignment.sectionId,
      facultyId: assignment.facultyId,
      types,
      changes,
    });
  };

  for (const [id, a] of afterById) {
    const prior = beforeById.get(id);
    if (!prior) {
      push(a, ["added"], [{ field: "added", before: "—", after: `${a.courseCode} ${a.sectionId} ${a.day} ${periodText(a)}` }]);
      continue;
    }
    const changes: FieldChange[] = [];
    if (prior.facultyId !== a.facultyId) changes.push({ field: "faculty", before: prior.facultyId || "—", after: a.facultyId || "—" });
    if (periodText(prior) !== periodText(a)) changes.push({ field: "time", before: periodText(prior), after: periodText(a) });
    if (prior.day !== a.day) changes.push({ field: "day", before: prior.day, after: a.day });
    if ((prior.roomId ?? "—") !== (a.roomId ?? "—")) changes.push({ field: "room", before: prior.roomId ?? "—", after: a.roomId ?? "—" });
    if ((prior.deliveryMode ?? "in-person") !== (a.deliveryMode ?? "in-person")) {
      changes.push({ field: "delivery", before: prior.deliveryMode ?? "in-person", after: a.deliveryMode ?? "in-person" });
    }
    if (prior.locked !== a.locked) changes.push({ field: "lock", before: prior.locked ? "locked" : "unlocked", after: a.locked ? "locked" : "unlocked" });
    const beforeColleges = (prior.collegeIds ?? []).join(", ");
    const afterColleges = (a.collegeIds ?? []).join(", ");
    if (beforeColleges !== afterColleges) changes.push({ field: "college", before: beforeColleges || "—", after: afterColleges || "—" });
    if (changes.length) push(a, changes.map((c) => c.field), changes);
  }

  for (const [id, a] of beforeById) {
    if (afterById.has(id)) continue;
    push(a, ["removed"], [{ field: "removed", before: `${a.courseCode} ${a.sectionId} ${a.day} ${periodText(a)}`, after: "—" }]);
  }

  let stateChange: FieldChange | null = null;
  if (states && states.before !== states.after) {
    stateChange = { field: "approval", before: states.before, after: states.after };
    counts.approval += 1;
  }

  rows.sort((a, b) => a.assignmentId.localeCompare(b.assignmentId));
  return { rows, counts, stateChange };
}

export function filterDiff(result: DiffResult, filters: { type?: ChangeType; faculty?: string; section?: string; college?: string }): DiffRow[] {
  return result.rows.filter((row) => {
    if (filters.type && !row.types.includes(filters.type)) return false;
    if (filters.faculty && row.facultyId !== filters.faculty) return false;
    if (filters.section && row.sectionId !== filters.section) return false;
    return true;
  });
}
