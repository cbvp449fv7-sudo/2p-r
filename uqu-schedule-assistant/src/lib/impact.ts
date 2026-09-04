/**
 * Change impact preview.
 *
 * Shown before a manual move, bulk edit, deletion, regeneration, or version
 * restore so the consequences are visible before anything is written.
 */

import type { AppData, Assignment } from "./types";
import { UNCLASSIFIED_COLLEGE_ID } from "./types";
import { allConflicts } from "./engine";
import { loadSummary } from "./rules";
import { isPreparatorySection, isRemote, physicalThursdayCount, preparatorySummary } from "./schedule-rules";
import { collegesForAssignment } from "./colleges";

export type ImpactPreview = {
  assignmentsAffected: string[];
  newConflicts: string[];
  resolvedConflicts: string[];
  facultyAffected: { id: string; before: number; after: number }[];
  sectionsAffected: string[];
  roomsAffected: string[];
  collegesAffected: string[];
  exportsOutdated: { collegeId: string; filename: string }[];
  versionsInvalidated: string[];
  approvalInvalidated: boolean;
  thursdayBefore: number;
  thursdayAfter: number;
  preparatoryChanges: { sectionId: string; before: number; after: number }[];
  /** True when the change is large enough to require the full preview. */
  material: boolean;
};

function conflictKeys(data: AppData): Set<string> {
  return new Set(allConflicts(data).map((c) => `${c.type}|${c.assignmentId}|${c.message}`));
}

function signature(a: Assignment): string {
  return [a.facultyId, a.roomId ?? "-", a.day, (a.periods ?? []).join("-"), a.start, a.end, a.deliveryMode ?? "", a.locked ? "L" : "U", (a.collegeIds ?? []).join(",")].join("|");
}

export function previewImpact(before: AppData, after: AppData): ImpactPreview {
  const beforeById = new Map(before.assignments.map((a) => [a.id, a]));
  const afterById = new Map(after.assignments.map((a) => [a.id, a]));

  const affected = new Set<string>();
  for (const [id, a] of afterById) {
    const prior = beforeById.get(id);
    if (!prior || signature(prior) !== signature(a)) affected.add(id);
  }
  for (const id of beforeById.keys()) if (!afterById.has(id)) affected.add(id);

  const beforeConflicts = conflictKeys(before);
  const afterConflicts = conflictKeys(after);
  const newConflicts = [...afterConflicts].filter((k) => !beforeConflicts.has(k)).map((k) => k.split("|").slice(2).join("|"));
  const resolvedConflicts = [...beforeConflicts].filter((k) => !afterConflicts.has(k)).map((k) => k.split("|").slice(2).join("|"));

  const facultyAffected = before.faculty
    .map((person) => ({
      id: person.id,
      before: loadSummary(person, before.assignments, before.settings).assigned,
      after: loadSummary(person, after.assignments, after.settings).assigned,
    }))
    .filter((x) => x.before !== x.after);

  const touched = [...affected].map((id) => afterById.get(id) ?? beforeById.get(id)).filter((a): a is Assignment => Boolean(a));
  const sectionsAffected = [...new Set(touched.map((a) => a.sectionId))];
  const roomsAffected = [...new Set(touched.map((a) => a.roomId).filter((r): r is string => Boolean(r)))];
  const collegesAffected = [...new Set(touched.flatMap((a) => collegesForAssignment(after, a).length ? collegesForAssignment(after, a) : [UNCLASSIFIED_COLLEGE_ID]))];

  const exportsOutdated = before.distributions
    .filter((p) => p.status !== "outdated" && collegesAffected.includes(p.collegeId))
    .map((p) => ({ collegeId: p.collegeId, filename: p.filename }));

  const preparatoryChanges = before.sections
    .filter(isPreparatorySection)
    .map((section) => ({
      sectionId: section.id,
      before: preparatorySummary(section.id, before.assignments, before.settings).inPersonPeriods,
      after: preparatorySummary(section.id, after.assignments, after.settings).inPersonPeriods,
    }))
    .filter((x) => x.before !== x.after);

  const approvalInvalidated = (before.scheduleState === "approved" || before.scheduleState === "distributed") && affected.size > 0;

  return {
    assignmentsAffected: [...affected],
    newConflicts,
    resolvedConflicts,
    facultyAffected,
    sectionsAffected,
    roomsAffected,
    collegesAffected,
    exportsOutdated,
    versionsInvalidated: approvalInvalidated && before.approvedVersionId ? [before.approvedVersionId] : [],
    approvalInvalidated,
    thursdayBefore: physicalThursdayCount(before.assignments),
    thursdayAfter: physicalThursdayCount(after.assignments),
    preparatoryChanges,
    material:
      affected.size > 1 ||
      newConflicts.length > 0 ||
      collegesAffected.length > 1 ||
      approvalInvalidated ||
      exportsOutdated.length > 0 ||
      preparatoryChanges.length > 0,
  };
}

export { isRemote };
