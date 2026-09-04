/**
 * Unscheduled assignments queue and repair suggestions.
 *
 * Every meeting the generator could not place is listed with the hard
 * constraints that blocked it, the candidates it considered, and ranked repairs
 * an administrator can apply. Locked assignments are never moved and hard
 * constraints are never bypassed silently.
 */

import type { AppData, Assignment, Room } from "./types";
import type { UnscheduledReason } from "./engine";
import { conflictsFor } from "./engine";
import { THURSDAY, capacityBlocked, isRemoteActivity } from "./schedule-rules";
import { periodsToRange } from "./period-table";

export type RepairKind = "alternative-time" | "alternative-room" | "alternative-faculty" | "move-other" | "use-thursday" | "enter-capacity" | "resolve-availability";

export type Repair = {
  id: string;
  kind: RepairKind;
  rank: number;
  summary: string;
  detail: string;
  /** Applying the repair returns the new assignment list, or null if it cannot. */
  apply: (data: AppData) => AppData | null;
};

export type QueueItem = {
  id: string;
  reason: UnscheduledReason;
  repairs: Repair[];
  /** False until suggestions have actually been worked out for this item. */
  repairsComputed: boolean;
  resolution: { status: "open" | "resolved" | "accepted"; note?: string };
};

function makeAssignment(data: AppData, reason: UnscheduledReason, day: string, periods: number[], roomId: string | null, facultyId: string): Assignment {
  const range = periodsToRange(data.settings, periods);
  const remote = isRemoteActivity(reason.need.activity);
  return {
    id: `FIX-${reason.need.courseCode}-${reason.need.sectionId}-${reason.need.activity || "1"}`,
    courseCode: reason.need.courseCode,
    sectionId: reason.need.sectionId,
    facultyId,
    roomId: remote ? null : roomId,
    day,
    start: range?.start ?? "08:00",
    end: range?.end ?? "08:50",
    teachingUnits: periods.length,
    locked: false,
    overtime: false,
    approval: "not-required",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activity: reason.need.activity || undefined,
    deliveryMode: remote ? "remote" : "in-person",
    periods,
    thursdayReason: day === THURSDAY && !remote ? "Applied from the unscheduled queue as the only remaining option." : undefined,
  };
}

/** Ranked repairs for one unscheduled meeting. */
export function suggestRepairs(data: AppData, reason: UnscheduledReason): Repair[] {
  const repairs: Repair[] = [];
  const length = reason.need.requiredPeriods || 2;
  const slots = data.settings.periods;
  const remote = isRemoteActivity(reason.need.activity);
  const rooms: (Room | null)[] = remote ? [null] : data.rooms;
  const nonThursday = data.settings.days.filter((d) => d !== THURSDAY);

  const tryPlace = (days: string[], kind: RepairKind, rank: number, label: (day: string, periods: number[], room: Room | null) => { summary: string; detail: string }) => {
    for (const day of days) {
      for (let i = 0; i + length <= slots.length; i += 1) {
        const periods = slots.slice(i, i + length).map((p) => p.period);
        for (const room of rooms) {
          const candidate = makeAssignment(data, reason, day, periods, room ? room.id : null, reason.need.facultyId);
          if (conflictsFor(candidate, data.assignments, data).length) continue;
          const text = label(day, periods, room);
          repairs.push({
            id: `${kind}-${day}-${periods.join("-")}-${room?.id ?? "remote"}`,
            kind,
            rank,
            summary: text.summary,
            detail: text.detail,
            apply: (current) => ({ ...current, assignments: [...current.assignments, candidate] }),
          });
          if (repairs.filter((r) => r.kind === kind).length >= 3) return;
        }
      }
    }
  };

  tryPlace(nonThursday, "alternative-time", 1, (day, periods, room) => ({
    summary: `Place on ${day}, periods ${periods.join(", ")}${room ? ` in ${room.id}` : ""}.`,
    detail: "A valid Sunday-to-Wednesday slot that satisfies every hard constraint.",
  }));

  if (!repairs.length || reason.thursdayWouldHelp) {
    tryPlace([THURSDAY], "use-thursday", 5, (day, periods, room) => ({
      summary: `Fall back to Thursday, periods ${periods.join(", ")}${room ? ` in ${room.id}` : ""}.`,
      detail: "Thursday is used only when no earlier day works, and the reason is recorded on the assignment.",
    }));
  }

  // Different qualified faculty member.
  const course = data.courses.find((c) => c.code === reason.need.courseCode);
  const alternatives = data.faculty.filter((f) => f.id !== reason.need.facultyId && (!course || f.specialization === course.specialization));
  for (const person of alternatives.slice(0, 3)) {
    for (const day of nonThursday) {
      for (let i = 0; i + length <= slots.length; i += 1) {
        const periods = slots.slice(i, i + length).map((p) => p.period);
        const candidate = makeAssignment(data, reason, day, periods, remote ? null : (data.rooms[0]?.id ?? null), person.id);
        if (conflictsFor(candidate, data.assignments, data).length) continue;
        repairs.push({
          id: `alternative-faculty-${person.id}-${day}`,
          kind: "alternative-faculty",
          rank: 3,
          summary: `Assign ${person.nameEn} on ${day}, periods ${periods.join(", ")}.`,
          detail: `${person.nameEn} teaches the same specialization and is free in this slot.`,
          apply: (current) => ({ ...current, assignments: [...current.assignments, candidate] }),
        });
        break;
      }
      if (repairs.some((r) => r.id.startsWith(`alternative-faculty-${person.id}`))) break;
    }
  }

  // Rooms rejected only because their capacity is unknown.
  for (const room of data.rooms.filter((r) => r.capacity === null).slice(0, 3)) {
    const section = data.sections.find((s) => s.id === reason.need.sectionId);
    if (!section) continue;
    if (!capacityBlocked(room, section)) continue;
    repairs.push({
      id: `enter-capacity-${room.id}`,
      kind: "enter-capacity",
      rank: 4,
      summary: `Enter a capacity for room ${room.id}.`,
      detail: `${room.id} was skipped because its capacity is unknown. Supplying one makes it available without any override.`,
      apply: () => null,
    });
  }

  // Unlocked assignments that could move out of the way.
  const blockers = data.assignments.filter((a) => !a.locked && a.facultyId === reason.need.facultyId).slice(0, 3);
  for (const blocker of blockers) {
    repairs.push({
      id: `move-other-${blocker.id}`,
      kind: "move-other",
      rank: 6,
      summary: `Move ${blocker.id} to free this faculty member.`,
      detail: `${blocker.id} is unlocked and occupies the same person. Locked assignments are never moved.`,
      apply: () => null,
    });
  }

  if (reason.overrideRequired) {
    repairs.push({
      id: "resolve-availability",
      kind: "resolve-availability",
      rank: 7,
      summary: "Record an authorized override reason or widen availability.",
      detail: reason.hardConstraints.find((c) => /override reason/i.test(c)) ?? "A hard constraint requires an authorized override.",
      apply: () => null,
    });
  }

  return repairs.sort((a, b) => a.rank - b.rank).slice(0, 12);
}

/**
 * Build the queue.
 *
 * Suggestions are expensive to compute, and a department-sized import can queue
 * hundreds of meetings, so only the first few are worked out up front. The rest
 * are computed on demand when an administrator asks for them.
 */
export function buildQueue(data: AppData, reasons: UnscheduledReason[], eagerSuggestions = 5): QueueItem[] {
  return reasons.map((reason, index) => ({
    id: `UNSCHED-${index + 1}`,
    reason,
    repairs: index < eagerSuggestions ? suggestRepairs(data, reason) : [],
    repairsComputed: index < eagerSuggestions,
    resolution: { status: "open" as const },
  }));
}

/** Apply several compatible repairs at once, reporting each outcome. */
export function batchRepair(data: AppData, items: { itemId: string; repair: Repair }[]) {
  let current = data;
  const applied: string[] = [];
  const failed: { itemId: string; reason: string }[] = [];
  for (const entry of items) {
    const next = entry.repair.apply(current);
    if (!next) {
      failed.push({ itemId: entry.itemId, reason: `${entry.repair.summary} cannot be applied automatically; it needs a manual edit.` });
      continue;
    }
    current = next;
    applied.push(entry.itemId);
  }
  return { data: current, applied, failed, partial: failed.length > 0 && applied.length > 0 };
}
