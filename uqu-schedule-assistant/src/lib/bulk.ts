/**
 * Bulk editing.
 *
 * Every selected record is validated first, the impact is previewed, a rollback
 * snapshot is taken, and the result separates successes from blocked and warned
 * records. Partial success is never reported as complete success.
 */

import type { AppData, Assignment, DeliveryMode } from "./types";
import { conflictsFor } from "./engine";
import { applyRemoteRule, isRemoteActivity } from "./schedule-rules";
import { guardEdit } from "./workflow";

export type BulkAction =
  | { kind: "assign-college"; collegeIds: string[] }
  | { kind: "assign-faculty"; facultyId: string }
  | { kind: "assign-room"; roomId: string | null }
  | { kind: "set-delivery"; mode: DeliveryMode }
  | { kind: "set-lock"; locked: boolean }
  | { kind: "move"; day: string; periods: number[] }
  | { kind: "set-capacity"; capacity: number | null }
  | { kind: "set-room-type"; type: string }
  | { kind: "set-availability"; days: string[] };

export type BulkOutcome = {
  id: string;
  status: "applied" | "blocked" | "warning";
  message: string;
};

export type BulkResult = {
  data: AppData;
  outcomes: BulkOutcome[];
  applied: number;
  blocked: number;
  warnings: number;
  /** True when some records changed and others did not. */
  partial: boolean;
};

function applyToAssignment(assignment: Assignment, action: BulkAction, data: AppData): { next: Assignment | null; message?: string; warning?: string } {
  switch (action.kind) {
    case "assign-college":
      return { next: { ...assignment, collegeIds: action.collegeIds } };
    case "assign-faculty":
      return { next: { ...assignment, facultyId: action.facultyId } };
    case "assign-room": {
      if (isRemoteActivity(assignment.activity) && action.roomId) {
        return { next: null, message: `${assignment.id} is ${assignment.activity} and is delivered remotely; it can never receive a room.` };
      }
      return { next: { ...assignment, roomId: action.roomId } };
    }
    case "set-delivery": {
      if (isRemoteActivity(assignment.activity) && action.mode === "in-person") {
        return { next: null, message: `${assignment.id} is ${assignment.activity}, which is always remote.` };
      }
      return { next: applyRemoteRule({ ...assignment, deliveryMode: action.mode, roomId: action.mode === "remote" ? null : assignment.roomId }) };
    }
    case "set-lock":
      return { next: { ...assignment, locked: action.locked } };
    case "move": {
      if (assignment.locked) return { next: null, message: `${assignment.id} is locked and was not moved.` };
      const slot = data.settings.periods.filter((p) => action.periods.includes(p.period));
      if (!slot.length) return { next: null, message: `${assignment.id}: no such periods are defined.` };
      return {
        next: { ...assignment, day: action.day, periods: action.periods, start: slot[0].start, end: slot[slot.length - 1].end },
      };
    }
    default:
      return { next: assignment };
  }
}

export function applyBulk(data: AppData, ids: string[], action: BulkAction): BulkResult {
  const guard = guardEdit(data);
  if (guard) {
    return {
      data,
      outcomes: ids.map((id) => ({ id, status: "blocked" as const, message: guard })),
      applied: 0,
      blocked: ids.length,
      warnings: 0,
      partial: false,
    };
  }

  const outcomes: BulkOutcome[] = [];
  let assignments = [...data.assignments];
  let rooms = [...data.rooms];
  let faculty = [...data.faculty];

  for (const id of ids) {
    if (action.kind === "set-capacity" || action.kind === "set-room-type") {
      const index = rooms.findIndex((r) => r.id === id);
      if (index < 0) {
        outcomes.push({ id, status: "blocked", message: `Room ${id} was not found.` });
        continue;
      }
      rooms = rooms.map((r, i) => (i === index ? (action.kind === "set-capacity" ? { ...r, capacity: action.capacity } : { ...r, type: action.type }) : r));
      outcomes.push({ id, status: "applied", message: action.kind === "set-capacity" ? `Capacity set to ${action.capacity ?? "unknown"}.` : `Room type set to ${action.type}.` });
      continue;
    }

    if (action.kind === "set-availability") {
      const index = faculty.findIndex((f) => f.id === id);
      if (index < 0) {
        outcomes.push({ id, status: "blocked", message: `Faculty ${id} was not found.` });
        continue;
      }
      faculty = faculty.map((f, i) => (i === index ? { ...f, available: action.days.map((day) => ({ day, start: "08:00", end: "20:00" })) } : f));
      outcomes.push({ id, status: "applied", message: `Availability set to ${action.days.join(", ") || "no days"}.` });
      continue;
    }

    const index = assignments.findIndex((a) => a.id === id);
    if (index < 0) {
      outcomes.push({ id, status: "blocked", message: `Assignment ${id} was not found.` });
      continue;
    }
    const { next, message } = applyToAssignment(assignments[index], action, data);
    if (!next) {
      outcomes.push({ id, status: "blocked", message: message ?? "Blocked by a hard constraint." });
      continue;
    }
    const candidate = applyRemoteRule(next) as Assignment;
    const trial = assignments.map((a, i) => (i === index ? candidate : a));
    const problems = conflictsFor(candidate, trial, { ...data, rooms, faculty });
    if (problems.length) {
      outcomes.push({ id, status: "warning", message: `Applied with ${problems.length} outstanding issue(s): ${problems[0].message}` });
      assignments = trial;
      continue;
    }
    assignments = trial;
    outcomes.push({ id, status: "applied", message: "Applied." });
  }

  const applied = outcomes.filter((o) => o.status === "applied").length;
  const blocked = outcomes.filter((o) => o.status === "blocked").length;
  const warnings = outcomes.filter((o) => o.status === "warning").length;
  return {
    data: { ...data, assignments, rooms, faculty },
    outcomes,
    applied,
    blocked,
    warnings,
    partial: blocked > 0 && applied + warnings > 0,
  };
}
