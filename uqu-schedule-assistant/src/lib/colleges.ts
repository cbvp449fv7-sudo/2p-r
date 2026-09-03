/**
 * College mapping.
 *
 * The workbooks carry المسار and القسم but no single normalized college field,
 * so every track/department pair is mapped explicitly. Nothing is guessed and
 * unmapped assignments block bulk export until they are resolved or explicitly
 * filed under غير مصنف.
 */

import type { AppData, Assignment, College, CollegeMapping, Section } from "./types";
import { UNCLASSIFIED_COLLEGE_ID } from "./types";
import { foldArabic, squash } from "./uqu/normalize";
import { isRemote } from "./schedule-rules";

export type TrackDepartmentPair = { track: string; department: string; assignments: number; sections: number };

/** Every distinct track/department pair present in the data. */
export function trackDepartmentPairs(data: Pick<AppData, "assignments" | "sections">): TrackDepartmentPair[] {
  const map = new Map<string, TrackDepartmentPair>();
  const note = (track: string, department: string, kind: "assignment" | "section") => {
    const key = `${foldArabic(track)}|${foldArabic(department)}`;
    const entry = map.get(key) ?? { track: squash(track), department: squash(department), assignments: 0, sections: 0 };
    if (kind === "assignment") entry.assignments += 1;
    else entry.sections += 1;
    map.set(key, entry);
  };
  for (const a of data.assignments) if (a.track || a.department) note(a.track ?? "", a.department ?? "", "assignment");
  for (const s of data.sections) if (s.track || s.department) note(s.track ?? "", s.department ?? "", "section");
  return [...map.values()].sort((a, b) => a.track.localeCompare(b.track) || a.department.localeCompare(b.department));
}

export function findMapping(mappings: CollegeMapping[], track: string, department: string): CollegeMapping | undefined {
  return mappings.find((m) => foldArabic(m.track) === foldArabic(track) && foldArabic(m.department) === foldArabic(department));
}

/** Colleges an assignment belongs to, resolved through confirmed mappings. */
export function collegesForAssignment(data: Pick<AppData, "collegeMappings" | "sections">, assignment: Assignment): string[] {
  if (assignment.collegeIds?.length) return assignment.collegeIds;
  const section = data.sections.find((s) => s.id === assignment.sectionId);
  const track = assignment.track ?? section?.track ?? "";
  const department = assignment.department ?? section?.department ?? "";
  const mapping = findMapping(data.collegeMappings, track, department);
  return mapping?.confirmed ? mapping.collegeIds : [];
}

export function isUnmapped(collegeIds: string[]): boolean {
  return collegeIds.length === 0;
}

/** Assignments that still need a college before a bulk export may run. */
export function unmappedAssignments(data: Pick<AppData, "assignments" | "collegeMappings" | "sections">): Assignment[] {
  return data.assignments.filter((a) => {
    const ids = collegesForAssignment(data, a);
    return ids.length === 0;
  });
}

export function collegeName(colleges: College[], id: string, locale: "ar" | "en" = "ar"): string {
  const found = colleges.find((c) => c.id === id);
  if (!found) return id;
  return locale === "ar" ? found.nameAr : found.nameEn || found.nameAr;
}

export type CollegeSummary = {
  collegeId: string;
  nameAr: string;
  nameEn: string;
  sections: number;
  assignments: number;
  remote: number;
  inPerson: number;
  shared: number;
  warnings: number;
};

/** Per-college counts previewed before export. */
export function collegeSummaries(data: AppData, warningsByCollege: Record<string, number> = {}): CollegeSummary[] {
  const summaries = new Map<string, CollegeSummary>();
  const ensure = (id: string) => {
    if (!summaries.has(id)) {
      const college = data.colleges.find((c) => c.id === id);
      summaries.set(id, {
        collegeId: id,
        nameAr: college?.nameAr ?? id,
        nameEn: college?.nameEn ?? id,
        sections: 0,
        assignments: 0,
        remote: 0,
        inPerson: 0,
        shared: 0,
        warnings: warningsByCollege[id] ?? 0,
      });
    }
    return summaries.get(id) as CollegeSummary;
  };

  const sectionSeen = new Map<string, Set<string>>();
  for (const assignment of data.assignments) {
    const ids = collegesForAssignment(data, assignment);
    const targets = ids.length ? ids : [UNCLASSIFIED_COLLEGE_ID];
    for (const id of targets) {
      const summary = ensure(id);
      summary.assignments += 1;
      if (isRemote(assignment)) summary.remote += 1;
      else summary.inPerson += 1;
      if (targets.length > 1) summary.shared += 1;
      const seen = sectionSeen.get(id) ?? new Set<string>();
      if (!seen.has(assignment.sectionId)) {
        seen.add(assignment.sectionId);
        summary.sections += 1;
      }
      sectionSeen.set(id, seen);
    }
  }
  return [...summaries.values()].sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
}

/**
 * The slice of the schedule one college may see.
 * Only that college's assignments, only the rooms they use, and only the
 * faculty and sections those assignments reference.
 */
export function collegeSlice(data: AppData, collegeId: string) {
  const assignments = data.assignments.filter((a) => {
    const ids = collegesForAssignment(data, a);
    return (ids.length ? ids : [UNCLASSIFIED_COLLEGE_ID]).includes(collegeId);
  });
  const sectionIds = new Set(assignments.map((a) => a.sectionId));
  const roomIds = new Set(assignments.map((a) => a.roomId).filter((id): id is string => Boolean(id)));
  const facultyIds = new Set(assignments.map((a) => a.facultyId).filter(Boolean));
  const courseCodes = new Set(assignments.map((a) => a.courseCode));
  return {
    assignments,
    sections: data.sections.filter((s) => sectionIds.has(s.id)) as Section[],
    rooms: data.rooms.filter((r) => roomIds.has(r.id)),
    faculty: data.faculty.filter((f) => facultyIds.has(f.id)),
    courses: data.courses.filter((c) => courseCodes.has(c.code)),
    /** Assignments this college shares with another college. */
    shared: assignments.filter((a) => collegesForAssignment(data, a).length > 1),
  };
}
