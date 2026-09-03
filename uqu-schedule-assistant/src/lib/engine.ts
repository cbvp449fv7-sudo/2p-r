import type { AppData, Assignment, Course, Faculty, Room, Section } from "./types";
import { teachingUnits } from "./rules";
import {
  THURSDAY,
  candidateDayOrder,
  capacityBlocked,
  isRemote,
  isRemoteActivity,
  occupiesRoom,
  remoteRoomViolation,
  thursdayCheck,
  travelConflicts,
} from "./schedule-rules";
import { clockToMinutes, periodsToRange } from "./period-table";

export type Conflict = { type: string; assignmentId: string; message: string };

const mins = (t: string) => clockToMinutes(t);

/** Clock span of a meeting, taking period definitions into account. */
function span(a: Pick<Assignment, "periods" | "start" | "end">, data: Pick<AppData, "settings">) {
  if (a.periods?.length) {
    const range = periodsToRange(data.settings, a.periods);
    if (range) return { start: mins(range.start), end: mins(range.end) };
  }
  return { start: mins(a.start), end: mins(a.end) };
}

function overlap(a: Assignment, b: Assignment, data: Pick<AppData, "settings">) {
  if (a.day !== b.day) return false;
  if (a.periods?.length && b.periods?.length) return a.periods.some((p) => b.periods?.includes(p));
  const x = span(a, data);
  const y = span(b, data);
  return x.start < y.end && y.start < x.end;
}

const inside = (day: string, start: string, end: string, periods: { day: string; start: string; end: string }[]) =>
  periods.some((p) => p.day === day && mins(start) >= mins(p.start) && mins(end) <= mins(p.end));

export function conflictsFor(a: Assignment, all: Assignment[], data: Pick<AppData, "faculty" | "courses" | "sections" | "rooms" | "settings" | "travelRules">): Conflict[] {
  const out: Conflict[] = [];
  const course = data.courses.find((x) => x.code === a.courseCode);
  const section = data.sections.find((x) => x.id === a.sectionId);
  const faculty = data.faculty.find((x) => x.id === a.facultyId);
  const remote = isRemote(a);
  const room = remote ? null : data.rooms.find((x) => x.id === a.roomId);

  if (!course || !section) return [{ type: "reference", assignmentId: a.id, message: `${a.id} has an unknown course or section reference.` }];
  if (!faculty) out.push({ type: "faculty-missing", assignmentId: a.id, message: `${a.id} has no faculty member assigned.` });
  if (!remote && !room) out.push({ type: "room-missing", assignmentId: a.id, message: `${a.id} is in-person but has no valid room.` });

  const remoteViolation = remoteRoomViolation(a);
  if (remoteViolation) out.push({ type: "remote-room", assignmentId: a.id, message: remoteViolation });

  const range = span(a, data);
  const startClock = a.periods?.length ? (periodsToRange(data.settings, a.periods)?.start ?? a.start) : a.start;
  const endClock = a.periods?.length ? (periodsToRange(data.settings, a.periods)?.end ?? a.end) : a.end;

  for (const b of all) {
    if (b.id === a.id || !overlap(a, b, data)) continue;
    const bc = data.courses.find((x) => x.code === b.courseCode);
    // A remote meeting never occupies a room, so it can never clash over one.
    if (occupiesRoom(a) && occupiesRoom(b) && b.roomId === a.roomId) {
      out.push({ type: "room", assignmentId: a.id, message: `Room ${a.roomId} is already assigned to ${bc?.code}, ${b.sectionId}, on ${a.day} from ${b.start} to ${b.end}.` });
    }
    // Faculty and student clashes apply to remote meetings too.
    if (b.facultyId === a.facultyId && faculty) {
      out.push({ type: "faculty", assignmentId: a.id, message: `${faculty.nameEn} is already teaching ${bc?.code} on ${a.day} at the same time.` });
    }
    const bs = data.sections.find((x) => x.id === b.sectionId);
    if (b.sectionId === a.sectionId || section.sharedGroups.some((g) => bs?.sharedGroups.includes(g))) {
      out.push({ type: "students", assignmentId: a.id, message: `${section.id} or its shared student group overlaps ${b.sectionId} on ${a.day}.` });
    }
  }

  if (room) {
    const capacityIssue = capacityBlocked(room, section, a.overrideReason);
    if (capacityIssue) out.push({ type: "capacity", assignmentId: a.id, message: `Room ${room.id}: ${capacityIssue}` });
    if (room.type !== course.roomType) out.push({ type: "room-type", assignmentId: a.id, message: `${course.code} requires ${course.roomType}; ${room.id} is ${room.type}.` });
    if (room.campus !== section.campus) out.push({ type: "campus", assignmentId: a.id, message: `Room campus does not match ${section.id}.` });
    if (room.availability.length && !inside(a.day, startClock, endClock, room.availability)) {
      out.push({ type: "room-availability", assignmentId: a.id, message: `Room ${room.id} is unavailable on ${a.day} from ${startClock} to ${endClock}.` });
    }
  }

  if (faculty) {
    if (faculty.campus !== section.campus && !remote) out.push({ type: "campus", assignmentId: a.id, message: `Campus mismatch for ${course.code}, ${section.id}.` });
    if (faculty.specialization !== course.specialization && !a.overrideReason) {
      out.push({ type: "specialization", assignmentId: a.id, message: `${faculty.nameEn} specialization does not match ${course.code}; an authorized override reason is required.` });
    }
    // Availability applies to remote meetings as well.
    if (faculty.available.length && (!inside(a.day, startClock, endClock, faculty.available) || inside(a.day, startClock, endClock, faculty.unavailable))) {
      out.push({ type: "faculty-availability", assignmentId: a.id, message: `${faculty.nameEn} is unavailable on ${a.day} from ${startClock} to ${endClock}.` });
    }
  }

  const thursday = thursdayCheck(a, data.settings);
  if (thursday.inPerson && thursday.requiresReason) {
    out.push({ type: "thursday", assignmentId: a.id, message: `${a.id}: ${thursday.message}` });
  }

  for (const travel of travelConflicts(data as Pick<AppData, "rooms" | "settings" | "travelRules">, all, a.facultyId)) {
    if (travel.assignmentId === a.id && travel.hard) out.push({ type: "travel", assignmentId: a.id, message: travel.message });
  }

  void range;
  return out;
}

export function allConflicts(data: AppData) {
  return data.assignments.flatMap((a) => conflictsFor(a, data.assignments, data));
}

type Need = { course: Course; section: Section; faculty: Faculty; activity: string; periods: number };

export type UnscheduledReason = {
  need: { courseCode: string; sectionId: string; activity: string; facultyId: string; requiredPeriods: number };
  hardConstraints: string[];
  consideredDays: string[];
  rejectedRooms: { roomId: string; reason: string }[];
  thursdayWouldHelp: boolean;
  overrideRequired: boolean;
};

export type GenerateResult = {
  ok: boolean;
  assignments: Assignment[];
  score: number;
  warnings: string[];
  /** Every meeting the generator could not place, with the reasons why. */
  unscheduled: UnscheduledReason[];
  /** Written explanation for each Thursday placement the generator chose. */
  thursdayExplanations: { assignmentId: string; reason: string }[];
};

export function generate(data: AppData, mode: "balanced" | "faculty" | "compact" = "balanced"): GenerateResult {
  const started = Date.now();
  const locked = [...data.assignments.filter((a) => a.locked)];
  // Locked meetings already cover part of the week. Count them per course and
  // section — by activity where the course has confirmed activity templates —
  // so the generator produces only the remaining meetings and never schedules
  // a locked one twice.
  const lockedCounts = new Map<string, number>();
  for (const a of locked) {
    for (const key of [`${a.courseCode}|${a.sectionId}`, `${a.courseCode}|${a.sectionId}|${a.activity ?? ""}`]) {
      lockedCounts.set(key, (lockedCounts.get(key) ?? 0) + 1);
    }
  }
  const takeCovered = (key: string) => {
    const remaining = lockedCounts.get(key) ?? 0;
    if (remaining <= 0) return false;
    lockedCounts.set(key, remaining - 1);
    return true;
  };
  const needs: Need[] = [];

  for (const section of data.sections) {
    for (const code of section.courseCodes) {
      const course = data.courses.find((x) => x.code === code);
      if (!course) continue;
      const patterns = data.coursePatterns.filter((p) => p.courseCode === code);
      const activities = patterns.length ? patterns : [{ courseCode: code, activity: "", periods: 0, deliveryMode: "in-person" as const, observations: 0, confirmed: false, source: "inferred" as const }];
      for (const pattern of activities) {
        const key = pattern.activity ? `${code}|${section.id}|${pattern.activity}` : `${code}|${section.id}`;
        const faculty = data.faculty.find((x) => x.specialization === course.specialization && (x.campus === section.campus || isRemoteActivity(pattern.activity)));
        const repeats = pattern.activity ? 1 : course.meetingsPerWeek;
        for (let i = 0; i < repeats; i += 1) {
          if (takeCovered(key)) continue;
          if (!faculty) continue;
          needs.push({ course, section, faculty, activity: pattern.activity, periods: pattern.periods });
        }
      }
    }
  }

  // Minimum-remaining-values ordering. The count is arithmetic and cached, so
  // sorting a full department's worth of meetings does not materialise every
  // candidate placement for every comparison.
  const counts = new Map<Need, number>();
  for (const need of needs) counts.set(need, candidateCount(need, data));
  needs.sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || a.course.code.localeCompare(b.course.code));

  let result: Assignment[] | null = null;
  const unscheduled: UnscheduledReason[] = [];

  let timedOut = false;
  const search = (i: number, current: Assignment[]): boolean => {
    if (Date.now() - started > data.settings.timeoutMs) {
      timedOut = true;
      return false;
    }
    if (i === needs.length) {
      result = current;
      return true;
    }
    const need = needs[i];
    const options = candidates(need, data, mode);
    const rejectedRooms: { roomId: string; reason: string }[] = [];
    const hardConstraints = new Set<string>();
    let thursdayWouldHelp = false;

    for (const option of options) {
      if (Date.now() - started > data.settings.timeoutMs) {
        timedOut = true;
        break;
      }
      const assignment = materialise(option, need, i);
      const problems = conflictsFor(assignment, current, data);
      if (problems.length === 0) {
        if (search(i + 1, [...current, assignment])) return true;
        continue;
      }
      for (const problem of problems) {
        hardConstraints.add(problem.message);
        if (problem.type === "capacity" || problem.type === "room" || problem.type === "room-type" || problem.type === "room-availability") {
          if (assignment.roomId) rejectedRooms.push({ roomId: assignment.roomId, reason: problem.message });
        }
      }
      if (option.day === THURSDAY && problems.every((p) => p.type === "thursday")) thursdayWouldHelp = true;
    }

    unscheduled.push({
      need: { courseCode: need.course.code, sectionId: need.section.id, activity: need.activity, facultyId: need.faculty.id, requiredPeriods: need.periods },
      hardConstraints: [...hardConstraints].slice(0, 8),
      consideredDays: [...new Set(options.map((o) => o.day))],
      rejectedRooms: rejectedRooms.slice(0, 8),
      thursdayWouldHelp,
      overrideRequired: [...hardConstraints].some((m) => /override reason/i.test(m)),
    });
    return false;
  };

  search(0, locked);

  if (!result) {
    return {
      ok: false,
      assignments: locked,
      score: 0,
      warnings: [
        timedOut
          ? `The search stopped after the configured ${data.settings.timeoutMs} ms timeout. Every meeting it could not place is listed in the unscheduled queue with the constraints that blocked it.`
          : "No valid schedule satisfies every hard constraint. Every meeting the generator could not place is listed in the unscheduled queue.",
      ],
      unscheduled,
      thursdayExplanations: [],
    };
  }

  const placed = result as Assignment[];
  const conflicts = placed.flatMap((a) => conflictsFor(a, placed, data));
  const thursdayExplanations = placed
    .filter((a) => a.day === THURSDAY)
    .map((a) => ({
      assignmentId: a.id,
      reason: isRemote(a)
        ? `${a.courseCode} ${a.activity ?? ""} is remote, so Thursday costs only the lower remote penalty and uses no room.`
        : `${a.courseCode} ${a.activity ?? ""} could not be placed on Sunday to Wednesday: ${a.thursdayReason ?? "every earlier day was blocked by a hard constraint"}.`,
    }));

  return {
    ok: true,
    assignments: placed,
    score: Math.max(0, 100 - conflicts.length * 8 - softPenalty(placed, data)),
    warnings: conflicts.map((c) => c.message),
    unscheduled: [],
    thursdayExplanations,
  };
}

/** Soft cost of a schedule. Thursday in-person is heavily discouraged. */
export function softPenalty(assignments: Assignment[], data: Pick<AppData, "settings">): number {
  let total = 0;
  for (const a of assignments) total += thursdayCheck(a, data.settings).penalty;
  return Math.round(total / 10);
}

function materialise(option: CandidateOption, need: Need, index: number): Assignment {
  const remote = isRemoteActivity(need.activity);
  return {
    ...option,
    id: `GEN-${String(index + 1).padStart(3, "0")}`,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date().toISOString(),
    locked: false,
    overtime: false,
    approval: "not-required",
    teachingUnits: need.periods || teachingUnits(need.course),
    activity: need.activity || undefined,
    deliveryMode: remote ? "remote" : "in-person",
    roomId: remote ? null : option.roomId,
    thursdayReason: option.day === THURSDAY && !remote ? "Placed on Thursday only because no Sunday-to-Wednesday option satisfied every hard constraint." : undefined,
  };
}

type CandidateOption = {
  courseCode: string;
  sectionId: string;
  facultyId: string;
  roomId: string | null;
  day: string;
  start: string;
  end: string;
  periods: number[];
};

/** How many placements a meeting could take, without building any of them. */
function candidateCount(need: Need, data: AppData): number {
  const length = need.periods || Math.max(1, Math.ceil(need.course.duration / 50));
  const slots = Math.max(0, data.settings.periods.length - length + 1);
  const rooms = isRemoteActivity(need.activity)
    ? 1
    : data.rooms.filter((r) => r.campus === need.section.campus && r.type === need.course.roomType && r.capacity !== null && r.capacity >= need.section.students).length;
  return data.settings.days.length * slots * rooms;
}

function candidates(need: Need, data: AppData, mode: string): CandidateOption[] {
  const out: CandidateOption[] = [];
  const remote = isRemoteActivity(need.activity);
  const length = need.periods || Math.max(1, Math.ceil(need.course.duration / 50));
  const usable = data.settings.periods.length ? data.settings.periods : [];
  // Sunday to Wednesday are tried before Thursday.
  const days = candidateDayOrder(data.settings.days);

  const rooms: (Room | null)[] = remote
    ? [null]
    : data.rooms.filter((r) => r.campus === need.section.campus && r.type === need.course.roomType && (r.capacity === null ? false : r.capacity >= need.section.students));

  for (const day of days) {
    for (let startIndex = 0; startIndex + length <= usable.length; startIndex += 1) {
      const slice = usable.slice(startIndex, startIndex + length);
      const periods = slice.map((p) => p.period);
      for (const room of rooms) {
        out.push({
          courseCode: need.course.code,
          sectionId: need.section.id,
          facultyId: need.faculty.id,
          roomId: room ? room.id : null,
          day,
          start: slice[0].start,
          end: slice[slice.length - 1].end,
          periods,
        });
      }
    }
  }

  return out.sort((a, b) => {
    // Thursday is always tried last, whatever the mode.
    const at = a.day === THURSDAY ? 1 : 0;
    const bt = b.day === THURSDAY ? 1 : 0;
    if (at !== bt) return at - bt;
    const ap = need.faculty.preferredDays.includes(a.day) ? 0 : 1;
    const bp = need.faculty.preferredDays.includes(b.day) ? 0 : 1;
    if (mode === "faculty") return ap - bp || a.start.localeCompare(b.start);
    if (mode === "compact") return a.start.localeCompare(b.start) || a.day.localeCompare(b.day);
    return a.day.localeCompare(b.day) || a.start.localeCompare(b.start) || (a.roomId ?? "").localeCompare(b.roomId ?? "");
  });
}
