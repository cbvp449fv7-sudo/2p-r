/**
 * Clone a previous semester.
 *
 * Reference data is copied; the copy starts as a draft and nothing is published
 * or approved automatically. The source semester is never modified.
 */

import type { AppData } from "./types";
import { defaultSettings } from "./demo";

export type CloneOptions = {
  faculty: boolean;
  courses: boolean;
  rooms: boolean;
  periods: boolean;
  constraints: boolean;
  collegeMappings: boolean;
  preferences: boolean;
  colorProfiles: boolean;
  /** Copy the schedule itself, which then needs review. */
  assignments: boolean;
};

export const DEFAULT_CLONE_OPTIONS: CloneOptions = {
  faculty: true,
  courses: true,
  rooms: true,
  periods: true,
  constraints: true,
  collegeMappings: true,
  preferences: true,
  colorProfiles: true,
  assignments: false,
};

export type CloneReview = {
  addedSections: string[];
  removedSections: string[];
  changedFaculty: string[];
  changedAvailability: string[];
  changedCapacities: string[];
  newCourses: string[];
  discontinuedCourses: string[];
  updatedMappings: string[];
};

export function cloneSemester(source: AppData, semester: string, options: CloneOptions = DEFAULT_CLONE_OPTIONS): AppData {
  const base = defaultSettings();
  const settings = {
    ...base,
    ...(options.constraints ? source.settings : {}),
    periods: options.periods ? structuredClone(source.settings.periods) : base.periods,
    semester,
    scheduleVersionNumber: 1,
  };
  return {
    ...source,
    schemaVersion: source.schemaVersion,
    faculty: options.faculty ? structuredClone(source.faculty) : [],
    courses: options.courses ? structuredClone(source.courses) : [],
    rooms: options.rooms ? structuredClone(source.rooms) : [],
    sections: [],
    assignments: options.assignments ? structuredClone(source.assignments) : [],
    versions: [],
    scenarios: [],
    distributions: [],
    audit: [{ id: crypto.randomUUID(), at: new Date().toISOString(), action: `Cloned from semester ${source.settings.semester}` }],
    collegeMappings: options.collegeMappings ? structuredClone(source.collegeMappings) : [],
    coursePatterns: options.courses ? structuredClone(source.coursePatterns) : [],
    facultyAliases: options.faculty ? structuredClone(source.facultyAliases) : [],
    roomColorProfiles: options.colorProfiles ? structuredClone(source.roomColorProfiles) : [],
    travelRules: options.constraints ? structuredClone(source.travelRules) : [],
    sourceRows: [],
    // A clone always begins as a draft and is never automatically approved.
    scheduleState: "draft",
    approvedVersionId: null,
    settings,
  };
}

/** What the administrator is asked to review after a clone. */
export function cloneReview(source: AppData, target: AppData): CloneReview {
  const sourceSections = new Set(source.sections.map((s) => s.id));
  const targetSections = new Set(target.sections.map((s) => s.id));
  const sourceCourses = new Set(source.courses.map((c) => c.code));
  const targetCourses = new Set(target.courses.map((c) => c.code));
  const capacityById = new Map(source.rooms.map((r) => [r.id, r.capacity]));
  return {
    addedSections: [...targetSections].filter((id) => !sourceSections.has(id)),
    removedSections: [...sourceSections].filter((id) => !targetSections.has(id)),
    changedFaculty: target.faculty.filter((f) => {
      const prior = source.faculty.find((x) => x.id === f.id);
      return prior && (prior.normalLimit !== f.normalLimit || prior.rank !== f.rank);
    }).map((f) => f.id),
    changedAvailability: target.faculty.filter((f) => {
      const prior = source.faculty.find((x) => x.id === f.id);
      return prior && JSON.stringify(prior.available) !== JSON.stringify(f.available);
    }).map((f) => f.id),
    changedCapacities: target.rooms.filter((r) => capacityById.has(r.id) && capacityById.get(r.id) !== r.capacity).map((r) => r.id),
    newCourses: [...targetCourses].filter((c) => !sourceCourses.has(c)),
    discontinuedCourses: [...sourceCourses].filter((c) => !targetCourses.has(c)),
    updatedMappings: target.collegeMappings.filter((m) => {
      const prior = source.collegeMappings.find((x) => x.track === m.track && x.department === m.department);
      return !prior || prior.collegeIds.join(",") !== m.collegeIds.join(",");
    }).map((m) => `${m.track} / ${m.department}`),
  };
}
