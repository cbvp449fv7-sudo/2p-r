import type { Assignment, Course, Faculty, Rank, Settings } from "./types";
import { isRemote } from "./schedule-rules";
import { squash } from "./uqu/normalize";

export const RANK_LOADS: Record<Rank, number> = {
  Professor: 10,
  "Associate Professor": 12,
  "Assistant Professor": 14,
  Lecturer: 16,
  "Teaching Assistant": 16,
  "Language Instructor": 18,
};
export const COMPENSATION_PER_UNIT = 150;

/**
 * Local Arabic job titles mapped to a default normal load.
 * Practising and advanced teacher titles are preserved as written; this map
 * only supplies a default that an explicit workbook value overrides.
 */
export const DEFAULT_TITLE_LOADS: Record<string, number> = {
  "استاذ": 10,
  "أستاذ": 10,
  "أستاذ مشارك": 12,
  "استاذ مشارك": 12,
  "أستاذ مساعد": 14,
  "استاذ مساعد": 14,
  "محاضر": 16,
  "معيد": 16,
  "معلم متقدم": 18,
  "معلم ممارس": 18,
  "مدرس لغة": 18,
};

export function teachingUnits(course: Pick<Course, "teachingType" | "duration">) {
  return course.teachingType === "theoretical" ? Math.floor(course.duration / 50) : Math.floor(course.duration / 100);
}

/**
 * The load a person is actually held to.
 * An explicit workbook value wins over the rank default; a recorded reduced
 * load wins over both.
 */
export function effectiveLoad(faculty: Faculty, settings?: Pick<Settings, "titleLoadMap">) {
  if (faculty.reducedLoad !== undefined && faculty.reducedLoad !== null) return faculty.reducedLoad;
  if (faculty.explicitLoads && faculty.workbookLoads) return faculty.workbookLoads.normal;
  const title = squash(faculty.jobTitleAr);
  const mapped = title ? (settings?.titleLoadMap?.[title] ?? DEFAULT_TITLE_LOADS[title]) : undefined;
  if (mapped !== undefined) return mapped;
  return faculty.normalLimit ?? RANK_LOADS[faculty.rank];
}

export function assignedUnits(facultyId: string, items: Assignment[]) {
  return items.filter((a) => a.facultyId === facultyId).reduce((n, a) => n + a.teachingUnits, 0);
}

/** Teaching units split by delivery mode. Remote meetings still count. */
export function unitsByMode(facultyId: string, items: Assignment[]) {
  const own = items.filter((a) => a.facultyId === facultyId);
  return {
    remote: own.filter(isRemote).reduce((n, a) => n + a.teachingUnits, 0),
    inPerson: own.filter((a) => !isRemote(a)).reduce((n, a) => n + a.teachingUnits, 0),
  };
}

export function loadSummary(faculty: Faculty, items: Assignment[], settings?: Pick<Settings, "titleLoadMap">) {
  const assigned = assignedUnits(faculty.id, items);
  const limit = effectiveLoad(faculty, settings);
  const overtime = Math.max(0, assigned - limit);
  const modes = unitsByMode(faculty.id, items);
  const workbook = faculty.workbookLoads;
  return {
    assigned,
    limit,
    overtime,
    compensation: overtime * COMPENSATION_PER_UNIT,
    underload: Math.max(0, limit - assigned),
    adminWarning: Boolean(faculty.adminRole && assigned < 3),
    remoteUnits: modes.remote,
    inPersonUnits: modes.inPerson,
    /**
     * Workbook categories, kept separate. اضافية is an additional-program
     * category, not approved overtime; overtime is calculated independently.
     */
    preparatory: workbook?.preparatory ?? 0,
    additional: workbook?.additional ?? 0,
    regular: workbook?.regular ?? 0,
    workbookTotal: workbook ? workbook.preparatory + workbook.additional + workbook.regular : 0,
    explicitLoads: Boolean(faculty.explicitLoads),
  };
}
