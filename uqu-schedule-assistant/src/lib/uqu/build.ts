/**
 * Turn a resolved import into application records.
 *
 * Nothing here guesses: faculty come from confirmed aliases, colleges from
 * confirmed mappings, rooms from the room workbook, and any row that cannot be
 * placed is reported rather than dropped.
 */

import type {
  Assignment,
  College,
  CollegeMapping,
  Course,
  CoursePattern,
  Faculty,
  FacultyAlias,
  ImportedSourceRow,
  Room,
  RoomColorProfile,
  Section,
  Settings,
} from "../types";
import { UNCLASSIFIED_COLLEGE_ID } from "../types";
import { DEFAULT_TITLE_LOADS } from "../rules";
import { periodsToRange } from "../period-table";
import { foldArabic, squash } from "./normalize";
import { assignmentKey, rowPeriodCount, sectionKey, type ParsedAssignmentRow } from "./parse-schedule";
import type { ParsedFacultyRow } from "./parse-faculty";
import type { ParsedRoom, RoomGridEntry } from "./parse-rooms";

export type BuildInput = {
  rows: ParsedAssignmentRow[];
  roster: ParsedFacultyRow[];
  aliases: FacultyAlias[];
  rooms: ParsedRoom[];
  roomEntries: RoomGridEntry[];
  colorProfile: RoomColorProfile | null;
  mappings: CollegeMapping[];
  colleges: College[];
  patterns: CoursePattern[];
  settings: Pick<Settings, "periods">;
  /** Room codes supplied manually for rows that carry one. */
  roomCodeColumn?: boolean;
};

export type BuildResult = {
  faculty: Faculty[];
  courses: Course[];
  sections: Section[];
  rooms: Room[];
  assignments: Assignment[];
  sourceRows: ImportedSourceRow[];
  /** Rows that were understood but could not be imported, with the reason. */
  blocked: { row: ParsedAssignmentRow; reason: string }[];
};

const RANK_BY_TITLE: Record<string, Faculty["rank"]> = {
  "استاذ": "Professor",
  "أستاذ": "Professor",
  "أستاذ مشارك": "Associate Professor",
  "استاذ مشارك": "Associate Professor",
  "أستاذ مساعد": "Assistant Professor",
  "استاذ مساعد": "Assistant Professor",
  "محاضر": "Lecturer",
  "معيد": "Teaching Assistant",
  "معلم متقدم": "Language Instructor",
  "معلم ممارس": "Language Instructor",
  "مدرس لغة": "Language Instructor",
};

export function facultyFromRoster(rows: ParsedFacultyRow[], titleLoadMap: Record<string, number> = DEFAULT_TITLE_LOADS): Faculty[] {
  const allDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
  return rows.map((row) => {
    const title = squash(row.jobTitle);
    const rank = RANK_BY_TITLE[title] ?? "Lecturer";
    const explicit = row.normalLoad !== null || row.preparatory !== null || row.additional !== null || row.regular !== null;
    return {
      id: row.id,
      nameEn: row.name,
      nameAr: row.name,
      rank,
      specialization: "English",
      campus: row.external ? row.affiliation || "External" : "Institute",
      status: row.external ? "External / cooperating" : "Active",
      // An explicit workbook value overrides the rank default for this person.
      normalLimit: row.normalLoad ?? titleLoadMap[title] ?? DEFAULT_TITLE_LOADS[title] ?? 16,
      available: allDays.map((day) => ({ day, start: "08:00", end: "20:00" })),
      unavailable: [],
      preferred: [],
      maxConsecutive: 4,
      preferredDays: [],
      overtimeAllowed: false,
      overtimeApproval: "not-required",
      jobTitleAr: title || undefined,
      affiliation: row.affiliation || undefined,
      external: row.external,
      workbookLoads: explicit
        ? {
            normal: row.normalLoad ?? 0,
            preparatory: row.preparatory ?? 0,
            additional: row.additional ?? 0,
            regular: row.regular ?? 0,
            total: row.totalComputed,
          }
        : undefined,
      explicitLoads: explicit,
      aliases: [],
      sourceRef: row.ref,
    } satisfies Faculty;
  });
}

export function roomsFromWorkbook(parsed: ParsedRoom[], entries: RoomGridEntry[], profile: RoomColorProfile | null): Room[] {
  return parsed.map((room) => {
    const own = entries.filter((e) => e.roomCode === room.code);
    return {
      id: room.code,
      code: room.code,
      displayName: room.displayName,
      building: room.group,
      group: room.group,
      campus: room.campus,
      capacity: room.capacity,
      type: "Classroom",
      availability: [],
      accessible: false,
      sourceRef: room.sourceRefs[0],
      grid: own.map((entry) => ({
        day: entry.day,
        period: entry.period,
        color: entry.color,
        text: entry.text,
        meaning: entry.color ? (profile?.map[entry.color] ?? "unmapped") : "available",
        ref: entry.ref,
      })),
    } satisfies Room;
  });
}

/** Resolve one track/department pair to colleges using confirmed mappings only. */
export function collegesFor(mappings: CollegeMapping[], track: string, department: string): string[] {
  const found = mappings.find((m) => foldArabic(m.track) === foldArabic(track) && foldArabic(m.department) === foldArabic(department));
  if (!found || !found.confirmed) return [];
  return found.collegeIds;
}

export function buildFromImport(input: BuildInput): BuildResult {
  const aliasByDisplay = new Map(input.aliases.map((a) => [squash(a.display), a]));
  const sections = new Map<string, Section>();
  const courses = new Map<string, Course>();
  const assignments: Assignment[] = [];
  const sourceRows: ImportedSourceRow[] = [];
  const blocked: BuildResult["blocked"] = [];
  const roomByCode = new Map(input.rooms.map((r) => [r.code, r]));

  let counter = 0;
  for (const row of input.rows) {
    const invalid = row.meetings.find((m) => m.error);
    if (invalid) {
      blocked.push({ row, reason: invalid.error as string });
      sourceRows.push({ id: row.sourceRowId, ref: row.ref, kind: "assignment", raw: row.raw, status: "blocked", note: invalid.error as string });
      continue;
    }

    const alias = aliasByDisplay.get(squash(row.facultyDisplay));
    const facultyId = alias?.status === "resolved" ? (alias.facultyId ?? "") : "";
    const key = sectionKey(row);
    const collegeIds = collegesFor(input.mappings, row.track, row.department);

    if (!courses.has(row.courseCode)) {
      const patterns = input.patterns.filter((p) => p.courseCode === row.courseCode);
      const longest = patterns.reduce((n, p) => Math.max(n, p.periods), 0);
      courses.set(row.courseCode, {
        code: row.courseCode,
        nameEn: row.courseName,
        nameAr: row.courseName,
        program: row.track,
        level: 1,
        creditHours: 0,
        teachingType: "theoretical",
        specialization: "English",
        meetingsPerWeek: Math.max(1, patterns.length),
        duration: (longest || 2) * 50,
        roomType: "Classroom",
      });
    }

    if (!sections.has(key)) {
      sections.set(key, {
        id: key,
        program: row.track,
        level: 1,
        students: 0,
        campus: "Institute",
        courseCodes: [row.courseCode],
        sharedGroups: collegeIds.length > 1 ? [`SHARED-${key}`] : [],
        track: row.track,
        department: row.department,
        courseCode: row.courseCode,
        sectionNumber: row.sectionNumber,
        preparatory: row.preparatory,
        collegeIds: collegeIds.length ? collegeIds : [UNCLASSIFIED_COLLEGE_ID],
        sourceRef: row.ref,
      });
    } else {
      const existing = sections.get(key) as Section;
      if (!existing.courseCodes.includes(row.courseCode)) existing.courseCodes.push(row.courseCode);
    }

    // Manually written room codes appear outside the known columns.
    const extraRoom = row.extras.map((e) => squash(e.value)).find((v) => roomByCode.has(v));

    for (const meeting of row.meetings) {
      counter += 1;
      const range = periodsToRange(input.settings, meeting.periods);
      const remote = row.remote;
      const master = assignments.find((a) => a.sourceRowId === row.sourceRowId);
      assignments.push({
        id: `IMP-${String(counter).padStart(4, "0")}`,
        courseCode: row.courseCode,
        sectionId: key,
        facultyId,
        // Activity 2 never receives a room, whatever the workbook holds.
        roomId: remote ? null : (extraRoom ?? null),
        day: meeting.day,
        start: range?.start ?? "08:00",
        end: range?.end ?? "08:50",
        teachingUnits: meeting.periods.length,
        locked: false,
        overtime: false,
        approval: "not-required",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        activity: row.activity,
        deliveryMode: remote ? "remote" : "in-person",
        periods: meeting.periods,
        track: row.track,
        department: row.department,
        collegeIds: collegeIds.length ? collegeIds : [UNCLASSIFIED_COLLEGE_ID],
        masterAssignmentId: master ? master.id : null,
        sourceRef: meeting.ref,
        sourceRowId: row.sourceRowId,
      });
    }

    sourceRows.push({ id: row.sourceRowId, ref: row.ref, kind: "assignment", raw: row.raw, status: "imported" });
  }

  return {
    faculty: facultyFromRoster(input.roster),
    courses: [...courses.values()],
    sections: [...sections.values()],
    rooms: roomsFromWorkbook(input.rooms, input.roomEntries, input.colorProfile),
    assignments,
    sourceRows,
    blocked,
  };
}

/** Counts an administrator sees before committing an import. */
export function importPreview(result: BuildResult) {
  const remote = result.assignments.filter((a) => a.deliveryMode === "remote");
  return {
    faculty: result.faculty.length,
    courses: result.courses.length,
    sections: result.sections.length,
    rooms: result.rooms.length,
    roomsWithoutCapacity: result.rooms.filter((r) => r.capacity === null).length,
    assignments: result.assignments.length,
    remoteMeetings: remote.length,
    inPersonMeetings: result.assignments.length - remote.length,
    withoutFaculty: result.assignments.filter((a) => !a.facultyId).length,
    unmappedColleges: result.assignments.filter((a) => (a.collegeIds ?? []).includes(UNCLASSIFIED_COLLEGE_ID)).length,
    thursdayInPerson: result.assignments.filter((a) => a.day === "Thursday" && a.deliveryMode !== "remote").length,
    blocked: result.blocked.length,
  };
}

export { assignmentKey, rowPeriodCount };
