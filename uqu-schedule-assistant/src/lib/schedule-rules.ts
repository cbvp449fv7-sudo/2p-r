/**
 * Departmental scheduling rules confirmed for 1448.
 *
 * These are hard rules and configurable penalties applied everywhere: during
 * import, generation, manual editing, validation, and export.
 */

import type { AppData, Assignment, DeliveryMode, Faculty, Room, Section, Settings, TravelRule } from "./types";
import { REMOTE_ACTIVITY, REMOTE_LABEL_AR } from "./types";
import { foldArabic, isPreparatoryText, squash } from "./uqu/normalize";
import { clockToMinutes, periodsToRange } from "./period-table";

export const THURSDAY = "Thursday";

/** Activity 2 is delivered remotely, always. */
export function isRemoteActivity(activity: string | undefined): boolean {
  if (!activity) return false;
  return foldArabic(activity) === foldArabic(REMOTE_ACTIVITY);
}

export function deliveryModeFor(activity: string | undefined, fallback: DeliveryMode = "in-person"): DeliveryMode {
  return isRemoteActivity(activity) ? "remote" : fallback;
}

export function isRemote(assignment: Pick<Assignment, "activity" | "deliveryMode">): boolean {
  return assignment.deliveryMode === "remote" || isRemoteActivity(assignment.activity);
}

/** Label shown wherever a room would otherwise appear. */
export function roomLabel(assignment: Pick<Assignment, "activity" | "deliveryMode" | "roomId">, locale: "ar" | "en" = "ar"): string {
  if (isRemote(assignment)) return locale === "ar" ? REMOTE_LABEL_AR : "Remote";
  return assignment.roomId ?? (locale === "ar" ? "بدون قاعة" : "No room");
}

/**
 * Hard rule: a remote meeting must never carry a physical room.
 * Returns an error message when the rule is broken.
 */
export function remoteRoomViolation(assignment: Pick<Assignment, "activity" | "deliveryMode" | "roomId" | "id">): string | null {
  if (!isRemote(assignment)) return null;
  if (assignment.roomId) {
    return `${assignment.id}: ${REMOTE_ACTIVITY} is delivered ${REMOTE_LABEL_AR} and must never be given a physical room (${assignment.roomId}).`;
  }
  return null;
}

/** Force the remote rule onto an assignment before it is stored. */
export function applyRemoteRule<T extends Pick<Assignment, "activity" | "deliveryMode" | "roomId">>(assignment: T): T {
  if (!isRemoteActivity(assignment.activity)) return assignment;
  return { ...assignment, deliveryMode: "remote", roomId: null };
}

/** Remote meetings never occupy a room, so they are excluded from room views. */
export function occupiesRoom(assignment: Pick<Assignment, "activity" | "deliveryMode" | "roomId">): boolean {
  return !isRemote(assignment) && Boolean(assignment.roomId);
}

/* ---------------------------------------------------------------- Thursday */

export type ThursdayCheck = {
  isThursday: boolean;
  inPerson: boolean;
  /** Penalty contributed to the soft score. */
  penalty: number;
  requiresReason: boolean;
  message: string | null;
};

export function thursdayCheck(assignment: Pick<Assignment, "day" | "activity" | "deliveryMode" | "thursdayReason">, settings: Pick<Settings, "thursdayInPersonPenalty" | "thursdayRemotePenalty">): ThursdayCheck {
  if (assignment.day !== THURSDAY) return { isThursday: false, inPerson: false, penalty: 0, requiresReason: false, message: null };
  if (isRemote(assignment)) {
    return {
      isThursday: true,
      inPerson: false,
      penalty: settings.thursdayRemotePenalty,
      requiresReason: false,
      message: `Remote ${REMOTE_ACTIVITY} on Thursday. No room is used and it is not counted as physical Thursday attendance.`,
    };
  }
  return {
    isThursday: true,
    inPerson: true,
    penalty: settings.thursdayInPersonPenalty,
    requiresReason: !assignment.thursdayReason,
    message: assignment.thursdayReason
      ? `In-person Thursday teaching, recorded reason: ${assignment.thursdayReason}`
      : "In-person Thursday teaching is strongly avoided and needs a written reason.",
  };
}

/** Only in-person Thursday meetings count as physical Thursday attendance. */
export function physicalThursdayCount(assignments: Assignment[]): number {
  return assignments.filter((a) => a.day === THURSDAY && !isRemote(a)).length;
}

/** Day order the generator tries: Sunday to Wednesday first, Thursday last. */
export function candidateDayOrder(days: string[]): string[] {
  return [...days].sort((a, b) => (a === THURSDAY ? 1 : 0) - (b === THURSDAY ? 1 : 0) || days.indexOf(a) - days.indexOf(b));
}

/* ------------------------------------------------------------ Preparatory */

export type PreparatorySummary = {
  sectionId: string;
  inPersonPeriods: number;
  remotePeriods: number;
  combinedPeriods: number;
  withinRange: boolean;
  remoteOnly: boolean;
  message: string | null;
};

export function isPreparatorySection(section: Pick<Section, "preparatory" | "track" | "department" | "program">): boolean {
  if (section.preparatory !== undefined) return section.preparatory;
  return isPreparatoryText(section.track) || isPreparatoryText(section.department) || isPreparatoryText(section.program);
}

export function periodCount(assignment: Pick<Assignment, "periods">): number {
  return assignment.periods?.length ?? 0;
}

/**
 * Weekly period totals for a preparatory section.
 * Activity 2 is remote and is recorded separately; only in-person periods are
 * held to the 6-8 range.
 */
export function preparatorySummary(sectionId: string, assignments: Assignment[], settings: Pick<Settings, "preparatoryMinPeriods" | "preparatoryMaxPeriods">): PreparatorySummary {
  const own = assignments.filter((a) => a.sectionId === sectionId);
  const inPersonPeriods = own.filter((a) => !isRemote(a)).reduce((n, a) => n + periodCount(a), 0);
  const remotePeriods = own.filter((a) => isRemote(a)).reduce((n, a) => n + periodCount(a), 0);
  const withinRange = inPersonPeriods >= settings.preparatoryMinPeriods && inPersonPeriods <= settings.preparatoryMaxPeriods;
  const remoteOnly = inPersonPeriods === 0 && remotePeriods > 0;
  return {
    sectionId,
    inPersonPeriods,
    remotePeriods,
    combinedPeriods: inPersonPeriods + remotePeriods,
    withinRange,
    remoteOnly,
    message: withinRange
      ? null
      : remoteOnly
        ? `Preparatory section ${sectionId} has only remote ${REMOTE_ACTIVITY} meetings and no in-person periods. Missing meetings are never invented.`
        : `Preparatory section ${sectionId} has ${inPersonPeriods} in-person periods, outside the required ${settings.preparatoryMinPeriods}–${settings.preparatoryMaxPeriods}.`,
  };
}

/* ------------------------------------------------------------ Travel time */

export function travelMinutes(rules: TravelRule[], from: Room | undefined, to: Room | undefined, settings: Pick<Settings, "minBreakMinutes">): { minutes: number; hard: boolean; rule: TravelRule | null } {
  if (!from || !to) return { minutes: 0, hard: false, rule: null };
  if (from.building === to.building && from.campus === to.campus) return { minutes: 0, hard: false, rule: null };
  const campusRule = rules.find((r) => r.scope === "campus" && ((r.fromBuilding === from.campus && r.toBuilding === to.campus) || (r.fromBuilding === to.campus && r.toBuilding === from.campus)));
  const buildingRule = rules.find((r) => r.scope === "building" && ((r.fromBuilding === from.building && r.toBuilding === to.building) || (r.fromBuilding === to.building && r.toBuilding === from.building)));
  const rule = from.campus !== to.campus ? (campusRule ?? buildingRule ?? null) : (buildingRule ?? null);
  return { minutes: rule?.minutes ?? settings.minBreakMinutes, hard: rule?.hard ?? false, rule };
}

export type TravelConflict = { assignmentId: string; otherId: string; requiredMinutes: number; availableMinutes: number; hard: boolean; message: string };

/**
 * Check a faculty member's consecutive meetings for enough time to move
 * between buildings. Remote meetings participate only when configured to.
 */
export function travelConflicts(data: Pick<AppData, "rooms" | "settings" | "travelRules">, assignments: Assignment[], facultyId: string): TravelConflict[] {
  const settings = data.settings;
  const own = assignments
    .filter((a) => a.facultyId === facultyId)
    .filter((a) => settings.remoteTravelCounts || !isRemote(a))
    .map((a) => {
      const range = a.periods?.length ? periodsToRange(settings, a.periods) : { start: a.start, end: a.end };
      return { a, start: clockToMinutes(range?.start ?? a.start), end: clockToMinutes(range?.end ?? a.end) };
    })
    .sort((x, y) => x.a.day.localeCompare(y.a.day) || x.start - y.start);

  const out: TravelConflict[] = [];
  for (let i = 1; i < own.length; i += 1) {
    const prev = own[i - 1];
    const next = own[i];
    if (prev.a.day !== next.a.day) continue;
    const fromRoom = data.rooms.find((r) => r.id === prev.a.roomId);
    const toRoom = data.rooms.find((r) => r.id === next.a.roomId);
    if (!fromRoom || !toRoom) continue;
    const { minutes, hard, rule } = travelMinutes(data.travelRules, fromRoom, toRoom, settings);
    if (minutes <= 0) continue;
    const available = next.start - prev.end;
    if (available >= minutes) continue;
    out.push({
      assignmentId: next.a.id,
      otherId: prev.a.id,
      requiredMinutes: minutes,
      availableMinutes: available,
      hard,
      message: `${prev.a.id} ends in ${fromRoom.building} and ${next.a.id} starts in ${toRoom.building} ${available} minutes later, but moving between them needs ${minutes} minutes${rule ? ` (${rule.scope} rule)` : " (minimum break)"}.`,
    });
  }
  return out;
}

/* --------------------------------------------------------------- Capacity */

/** A room with an unknown capacity may not be used under a capacity constraint. */
export function capacityBlocked(room: Pick<Room, "capacity">, section: Pick<Section, "students">, overrideReason?: string): string | null {
  if (room.capacity === null) {
    return overrideReason ? null : "Capacity unknown. Supply a capacity or record an authorized override reason before assigning this room.";
  }
  return room.capacity < section.students ? `Capacity ${room.capacity} is below enrollment ${section.students}.` : null;
}

/* ----------------------------------------------------------------- Loads */

/** Teaching units credited for a meeting. Remote meetings count in full. */
export function unitsForPeriods(periods: number): number {
  return periods;
}

export function facultyDisplayName(faculty: Pick<Faculty, "nameAr" | "nameEn"> | undefined, locale: "ar" | "en"): string {
  if (!faculty) return locale === "ar" ? "غير محدد" : "Unassigned";
  return locale === "ar" ? squash(faculty.nameAr) || squash(faculty.nameEn) : squash(faculty.nameEn) || squash(faculty.nameAr);
}
