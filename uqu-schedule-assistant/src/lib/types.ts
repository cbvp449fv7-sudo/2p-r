export type Locale = "en" | "ar";
export type Rank = "Professor" | "Associate Professor" | "Assistant Professor" | "Lecturer" | "Teaching Assistant" | "Language Instructor";
export type Period = { day: string; start: string; end: string };

/** Where a value came from. Every imported value keeps one of these. */
export type SourceRef = { workbook: string; sheet: string; row: number; column: string };
/** One imported cell: raw as displayed, normalized as understood, plus its validation state. */
export type SourceValue = {
  ref: SourceRef;
  raw: string;
  normalized: string;
  state: "valid" | "warning" | "invalid";
  note?: string;
};

export type DeliveryMode = "in-person" | "remote";

/** Activity 2 is always delivered remotely and never receives a physical room. */
export const REMOTE_ACTIVITY = "نشاط 2";
export const REMOTE_LABEL_AR = "عن بُعد";
export const UNCLASSIFIED_COLLEGE_ID = "COL-UNCLASSIFIED";

export type Faculty = {
  id: string;
  nameEn: string;
  nameAr: string;
  rank: Rank;
  specialization: string;
  campus: string;
  status: string;
  normalLimit: number;
  reducedLoad?: number;
  adminRole?: string;
  available: Period[];
  unavailable: Period[];
  preferred: Period[];
  maxConsecutive: number;
  preferredDays: string[];
  overtimeAllowed: boolean;
  overtimeApproval: "not-required" | "pending" | "approved" | "rejected";
  /** Original Arabic job title exactly as written in the roster. */
  jobTitleAr?: string;
  /** خارج المعهد / الكلية-تعاون text, or the internal group heading. */
  affiliation?: string;
  external?: boolean;
  /** Workbook load columns. Present only when the roster supplied them. */
  workbookLoads?: { normal: number; preparatory: number; additional: number; regular: number; total: number };
  /** True when workbookLoads came from the file and must override rank defaults. */
  explicitLoads?: boolean;
  /** Display spellings that resolve to this person, confirmed by an administrator. */
  aliases?: string[];
  sourceRef?: SourceRef;
};

export type Course = {
  code: string;
  nameEn: string;
  nameAr: string;
  program: string;
  level: number;
  creditHours: number;
  teachingType: "theoretical" | "practical" | "field";
  specialization: string;
  meetingsPerWeek: number;
  duration: number;
  roomType: string;
};

/** An observed course/activity shape, editable once confirmed. */
export type CoursePattern = {
  courseCode: string;
  activity: string;
  periods: number;
  deliveryMode: DeliveryMode;
  observations: number;
  confirmed: boolean;
  source: "inferred" | "manual";
};

export type Section = {
  id: string;
  program: string;
  level: number;
  students: number;
  campus: string;
  courseCodes: string[];
  sharedGroups: string[];
  /** Composite identity from the workbook. A section number alone is not unique. */
  track?: string;
  department?: string;
  courseCode?: string;
  sectionNumber?: string;
  preparatory?: boolean;
  collegeIds?: string[];
  sourceRef?: SourceRef;
};

export type Room = {
  id: string;
  building: string;
  campus: string;
  /** null means the capacity is unknown and must not be assumed. */
  capacity: number | null;
  type: string;
  availability: Period[];
  accessible: boolean;
  /** Workbook room code, e.g. the dotted building/room reference. */
  code?: string;
  displayName?: string;
  group?: string;
  sourceRef?: SourceRef;
  /** Per day/period grid cells imported from the room workbook. */
  grid?: RoomGridCell[];
};

export type RoomGridCell = {
  day: string;
  period: number;
  color: string | null;
  text: string | null;
  meaning: ColorMeaning;
  ref: SourceRef;
};

export type ColorMeaning = "occupied" | "unavailable" | "available" | "informational" | "ignore" | "unmapped";

export type RoomColorProfile = {
  id: string;
  name: string;
  /** Colour key (ARGB or theme reference) to administrator-chosen meaning. */
  map: Record<string, ColorMeaning>;
  createdAt: string;
};

export type Assignment = {
  id: string;
  courseCode: string;
  sectionId: string;
  facultyId: string;
  /** null whenever the meeting is remote. Activity 2 is always null. */
  roomId: string | null;
  day: string;
  start: string;
  end: string;
  teachingUnits: number;
  locked: boolean;
  overtime: boolean;
  approval: "not-required" | "pending" | "approved";
  overrideReason?: string;
  createdAt: string;
  updatedAt: string;
  /** Arabic activity label, e.g. نشاط 1. */
  activity?: string;
  deliveryMode?: DeliveryMode;
  /** Period numbers this meeting occupies, 1-based. */
  periods?: number[];
  track?: string;
  department?: string;
  collegeIds?: string[];
  /** Set on shared meetings; points at the single master assignment. */
  masterAssignmentId?: string | null;
  /** Required whenever an in-person meeting lands on Thursday. */
  thursdayReason?: string;
  sourceRef?: SourceRef;
  /** Groups meetings split out of one multi-day workbook row. */
  sourceRowId?: string;
};

export type ScheduleState = "draft" | "review" | "approved" | "distributed" | "superseded";

export type ScheduleVersion = {
  id: string;
  name: string;
  date: string;
  author: string;
  summary: string;
  conflicts: number;
  score: number;
  status: "draft" | "active" | "archived";
  assignments: Assignment[];
  /** Publication state this snapshot was taken in. */
  state?: ScheduleState;
  reason?: string;
  operator?: string;
};

export type College = { id: string; nameAr: string; nameEn: string; builtIn?: boolean };

export type CollegeMapping = {
  track: string;
  department: string;
  collegeIds: string[];
  confirmed: boolean;
  note?: string;
};

/** One period slot and its optional confirmed clock time. */
export type PeriodSlot = { period: number; start: string; end: string; confirmed: boolean };

export type TravelRule = {
  id: string;
  fromBuilding: string;
  toBuilding: string;
  minutes: number;
  hard: boolean;
  scope: "building" | "campus";
};

export type DistributionPackage = {
  id: string;
  collegeId: string;
  versionId: string;
  versionName: string;
  exportedAt: string;
  filename: string;
  assignmentCount: number;
  exportedBy: string;
  checksum: string;
  status: "generated" | "delivered" | "replaced" | "outdated";
};

export type Scenario = {
  id: string;
  name: string;
  createdAt: string;
  baseVersionId: string | null;
  assignments: Assignment[];
  weights: Record<string, number>;
  note?: string;
};

export type FacultyAlias = {
  id: string;
  display: string;
  facultyId: string | null;
  status: "resolved" | "unresolved" | "ambiguous";
  candidates: string[];
  sourceRefs: SourceRef[];
};

export type Settings = {
  days: string[];
  startHour: number;
  endHour: number;
  totalWorkHours: number;
  overtimeCeiling: number | null;
  timeoutMs: number;
  weights: Record<string, number>;
  programs: { name: string; credits: number; enabled: boolean; status: string }[];
  /** Period definitions. Clock times start unconfirmed and gate calendar export. */
  periods: PeriodSlot[];
  /** Soft penalty applied to in-person Thursday placement. */
  thursdayInPersonPenalty: number;
  /** Lower penalty for remote Thursday, which the department already uses. */
  thursdayRemotePenalty: number;
  preparatoryMinPeriods: number;
  preparatoryMaxPeriods: number;
  /** Whether remote meetings participate in travel-time checks. */
  remoteTravelCounts: boolean;
  minBreakMinutes: number;
  operatorName: string;
  semester: string;
  scheduleVersionNumber: number;
  /** Local Arabic job title to load-category mapping. */
  titleLoadMap: Record<string, number>;
};

export type QualitySeverity = "error" | "warning" | "info";

export type QualityIssue = {
  id: string;
  category: string;
  severity: QualitySeverity;
  messageEn: string;
  messageAr: string;
  entity: { kind: "assignment" | "faculty" | "section" | "room" | "course" | "mapping" | "import"; id: string };
  ref?: SourceRef;
  /** Route + query that opens the affected record. */
  link?: string;
  fixable?: boolean;
};

export type AppData = {
  schemaVersion: number;
  faculty: Faculty[];
  courses: Course[];
  sections: Section[];
  rooms: Room[];
  assignments: Assignment[];
  versions: ScheduleVersion[];
  settings: Settings;
  audit: { id: string; at: string; action: string; reason?: string }[];
  colleges: College[];
  collegeMappings: CollegeMapping[];
  coursePatterns: CoursePattern[];
  facultyAliases: FacultyAlias[];
  roomColorProfiles: RoomColorProfile[];
  travelRules: TravelRule[];
  distributions: DistributionPackage[];
  scenarios: Scenario[];
  scheduleState: ScheduleState;
  /** Set when the current schedule was approved; cleared on reopen. */
  approvedVersionId: string | null;
  /** Import provenance so no source row is ever silently lost. */
  sourceRows: ImportedSourceRow[];
};

export type ImportedSourceRow = {
  id: string;
  ref: SourceRef;
  kind: "assignment" | "faculty" | "room";
  raw: Record<string, string>;
  status: "imported" | "skipped" | "blocked";
  note?: string;
};
