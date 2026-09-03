import { describe, expect, it } from "vitest";
import { createDemoData } from "./demo";
import { conflictsFor, generate } from "./engine";
import { loadSummary } from "./rules";
import {
  applyRemoteRule,
  candidateDayOrder,
  capacityBlocked,
  isRemote,
  isRemoteActivity,
  occupiesRoom,
  physicalThursdayCount,
  preparatorySummary,
  remoteRoomViolation,
  roomLabel,
  thursdayCheck,
  travelConflicts,
} from "./schedule-rules";
import { clockTimesComplete, defaultPeriodTable } from "./period-table";
import { runQualityChecks } from "./quality";
import { buildQueue, suggestRepairs, batchRepair } from "./unscheduled";
import { previewImpact } from "./impact";
import { approve, guardEdit, isLocked, reopen, sendForReview } from "./workflow";
import { cloneIntoScenario, discardScenario, promoteScenario, scenarioMetrics } from "./scenarios";
import { applyBulk } from "./bulk";
import { cloneSemester, DEFAULT_CLONE_OPTIONS } from "./clone";
import { diffSchedules } from "./diff";
import { buildIcs, eventUid, icsGate } from "./ics";
import { checksum, distributionWarnings, markDelivered, recordPackage } from "./distribution";
import { buildAllColleges, buildCollegeWorkbook, bulkExportGate } from "./export-college";
import { collegeSlice, collegesForAssignment, unmappedAssignments } from "./colleges";
import { fairnessReport, distributionIndex, DEFAULT_INDEX_WEIGHTS } from "./fairness";
import { migrate } from "./storage";
import type { AppData, Assignment } from "./types";
import { REMOTE_ACTIVITY, UNCLASSIFIED_COLLEGE_ID } from "./types";
import * as XLSX from "@e965/xlsx";

/** A small, fully-mapped dataset shaped like an imported 1448 schedule. */
function scheduleFixture(): AppData {
  const base = createDemoData();
  const now = new Date().toISOString();
  const meeting = (over: Partial<Assignment>): Assignment => ({
    id: "X",
    courseCode: "TSTE1201",
    sectionId: "SEC-PREP",
    facultyId: "F-001",
    roomId: "R-1",
    day: "Sunday",
    start: "08:00",
    end: "11:20",
    teachingUnits: 4,
    locked: false,
    overtime: false,
    approval: "not-required",
    createdAt: now,
    updatedAt: now,
    activity: "نشاط 1",
    deliveryMode: "in-person",
    periods: [1, 2, 3, 4],
    track: "تاهيلي تجريبي",
    department: "قسم تجريبي",
    collegeIds: ["COL-A"],
    ...over,
  });

  return {
    ...base,
    colleges: [
      ...base.colleges,
      { id: "COL-A", nameAr: "كلية الهندسة التجريبية", nameEn: "Demo Engineering" },
      { id: "COL-B", nameAr: "كلية العلوم التجريبية", nameEn: "Demo Science" },
    ],
    collegeMappings: [
      { track: "تاهيلي تجريبي", department: "قسم تجريبي", collegeIds: ["COL-A"], confirmed: true },
      { track: "مسار ثان", department: "قسم ثان", collegeIds: ["COL-B"], confirmed: true },
    ],
    faculty: [
      { ...base.faculty[0], id: "F-001", nameEn: "Demo One", nameAr: "تجريبي أول", specialization: "English", campus: "Institute", normalLimit: 16, available: [], preferredDays: [] },
      { ...base.faculty[1], id: "F-002", nameEn: "Demo Two", nameAr: "تجريبي ثانٍ", specialization: "English", campus: "Institute", normalLimit: 16, available: [], preferredDays: [] },
    ],
    courses: [{ ...base.courses[0], code: "TSTE1201", specialization: "English", roomType: "Classroom", duration: 200, meetingsPerWeek: 1 }],
    sections: [
      { id: "SEC-PREP", program: "تاهيلي تجريبي", level: 1, students: 20, campus: "Institute", courseCodes: ["TSTE1201"], sharedGroups: [], track: "تاهيلي تجريبي", department: "قسم تجريبي", sectionNumber: "150", preparatory: true, collegeIds: ["COL-A"] },
      { id: "SEC-B", program: "مسار ثان", level: 1, students: 20, campus: "Institute", courseCodes: ["TSTE1201"], sharedGroups: [], track: "مسار ثان", department: "قسم ثان", sectionNumber: "9", preparatory: false, collegeIds: ["COL-B"] },
    ],
    rooms: [
      { id: "R-1", code: "25-1.001", displayName: "ق101", building: "المبنى الرئيسي", group: "المبنى الرئيسي", campus: "Institute", capacity: 40, type: "Classroom", availability: [], accessible: true },
      { id: "R-2", code: "24-0.001", displayName: "ق2-1", building: "ق2", group: "ق2", campus: "Institute", capacity: null, type: "Classroom", availability: [], accessible: true },
    ],
    coursePatterns: [
      { courseCode: "TSTE1201", activity: "نشاط 1", periods: 4, deliveryMode: "in-person", observations: 1, confirmed: true, source: "inferred" },
      { courseCode: "TSTE1201", activity: REMOTE_ACTIVITY, periods: 4, deliveryMode: "remote", observations: 1, confirmed: true, source: "inferred" },
      { courseCode: "TSTE1201", activity: "نشاط 3", periods: 2, deliveryMode: "in-person", observations: 1, confirmed: true, source: "inferred" },
    ],
    assignments: [
      meeting({ id: "A-PREP-1", activity: "نشاط 1", periods: [1, 2, 3, 4] }),
      meeting({ id: "A-PREP-3", activity: "نشاط 3", periods: [5, 6], day: "Monday", teachingUnits: 2 }),
      meeting({ id: "A-PREP-2", activity: REMOTE_ACTIVITY, deliveryMode: "remote", roomId: null, periods: [7, 8, 9, 10], day: "Thursday" }),
      meeting({ id: "A-B-1", sectionId: "SEC-B", facultyId: "F-002", track: "مسار ثان", department: "قسم ثان", collegeIds: ["COL-B"], day: "Tuesday", periods: [1, 2, 3, 4] }),
    ],
    settings: { ...base.settings, days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"], periods: defaultPeriodTable() },
  };
}

describe("Activity 2 is remote", () => {
  const data = scheduleFixture();

  it("never receives a room", () => {
    expect(isRemoteActivity(REMOTE_ACTIVITY)).toBe(true);
    const remote = data.assignments.find((a) => a.activity === REMOTE_ACTIVITY)!;
    expect(remote.roomId).toBeNull();
    expect(occupiesRoom(remote)).toBe(false);
  });

  it("is forced remote and room-free whenever it is written", () => {
    const forced = applyRemoteRule({ activity: REMOTE_ACTIVITY, deliveryMode: "in-person", roomId: "R-1" });
    expect(forced.deliveryMode).toBe("remote");
    expect(forced.roomId).toBeNull();
  });

  it("raises a blocking error if it is given a physical room", () => {
    const bad = { ...data.assignments.find((a) => a.activity === REMOTE_ACTIVITY)!, roomId: "R-1" };
    expect(remoteRoomViolation(bad)).toContain("never be given a physical room");
    expect(conflictsFor(bad, data.assignments, data).some((c) => c.type === "remote-room")).toBe(true);
    const report = runQualityChecks({ ...data, assignments: [bad] });
    expect(report.issues.some((i) => i.category === "remote-room" && i.severity === "error")).toBe(true);
  });

  it("is labelled عن بُعد everywhere a room would appear", () => {
    const remote = data.assignments.find((a) => a.activity === REMOTE_ACTIVITY)!;
    expect(roomLabel(remote, "ar")).toBe("عن بُعد");
    expect(roomLabel(remote, "en")).toBe("Remote");
  });

  it("still counts toward faculty teaching load", () => {
    const summary = loadSummary(data.faculty[0], data.assignments, data.settings);
    expect(summary.remoteUnits).toBe(4);
    expect(summary.assigned).toBe(10);
  });

  it("still creates faculty and section conflicts", () => {
    const remote = data.assignments.find((a) => a.activity === REMOTE_ACTIVITY)!;
    const clash: Assignment = { ...remote, id: "CLASH", activity: "نشاط 3", deliveryMode: "in-person", roomId: "R-1" };
    const problems = conflictsFor(clash, [...data.assignments, clash], data);
    expect(problems.some((c) => c.type === "faculty")).toBe(true);
    expect(problems.some((c) => c.type === "students")).toBe(true);
  });

  it("is excluded from physical room utilization", () => {
    const roomUsers = data.assignments.filter(occupiesRoom);
    expect(roomUsers.every((a) => !isRemote(a))).toBe(true);
    expect(roomUsers.length).toBe(3);
  });
});

describe("Thursday", () => {
  const data = scheduleFixture();

  it("orders Sunday to Wednesday before Thursday", () => {
    expect(candidateDayOrder(data.settings.days).at(-1)).toBe("Thursday");
  });

  it("penalises in-person Thursday far more than remote Thursday", () => {
    const inPerson = thursdayCheck({ day: "Thursday", activity: "نشاط 1", deliveryMode: "in-person" }, data.settings);
    const remote = thursdayCheck({ day: "Thursday", activity: REMOTE_ACTIVITY, deliveryMode: "remote" }, data.settings);
    expect(inPerson.penalty).toBeGreaterThan(remote.penalty);
    expect(remote.penalty).toBe(data.settings.thursdayRemotePenalty);
  });

  it("requires a written reason for a manual in-person Thursday assignment", () => {
    const check = thursdayCheck({ day: "Thursday", activity: "نشاط 1", deliveryMode: "in-person" }, data.settings);
    expect(check.requiresReason).toBe(true);
    const withReason = thursdayCheck({ day: "Thursday", activity: "نشاط 1", deliveryMode: "in-person", thursdayReason: "room unavailable earlier" }, data.settings);
    expect(withReason.requiresReason).toBe(false);
    expect(withReason.message).toContain("room unavailable earlier");
  });

  it("keeps remote Thursday possible and out of physical attendance", () => {
    const remote = data.assignments.find((a) => a.day === "Thursday")!;
    expect(isRemote(remote)).toBe(true);
    expect(physicalThursdayCount(data.assignments)).toBe(0);
  });

  it("explains every Thursday placement the generator chooses", () => {
    const result = generate(data, "balanced");
    for (const explanation of result.thursdayExplanations) {
      expect(explanation.reason.length).toBeGreaterThan(10);
    }
  });

  it("avoids in-person Thursday when an earlier day is available", () => {
    const result = generate({ ...scheduleFixture(), assignments: [] }, "balanced");
    if (result.ok) {
      expect(result.assignments.filter((a) => a.day === "Thursday" && !isRemote(a)).length).toBe(0);
    }
  });
});

describe("preparatory sections", () => {
  const data = scheduleFixture();

  it("counts only in-person periods toward the 6-8 range", () => {
    const summary = preparatorySummary("SEC-PREP", data.assignments, data.settings);
    expect(summary.inPersonPeriods).toBe(6);
    expect(summary.remotePeriods).toBe(4);
    expect(summary.combinedPeriods).toBe(10);
    expect(summary.withinRange).toBe(true);
  });

  it("accepts eight in-person periods", () => {
    const eight = data.assignments.map((a) => (a.id === "A-PREP-3" ? { ...a, periods: [5, 6, 7, 8] } : a));
    expect(preparatorySummary("SEC-PREP", eight, data.settings).inPersonPeriods).toBe(8);
    expect(preparatorySummary("SEC-PREP", eight, data.settings).withinRange).toBe(true);
  });

  it("flags a value outside the range", () => {
    const five = data.assignments.map((a) => (a.id === "A-PREP-3" ? { ...a, periods: [5] } : a));
    const summary = preparatorySummary("SEC-PREP", five, data.settings);
    expect(summary.withinRange).toBe(false);
    expect(summary.message).toContain("5 in-person periods");
  });

  it("flags a remote-only preparatory section without inventing meetings", () => {
    const remoteOnly = data.assignments.filter((a) => a.activity === REMOTE_ACTIVITY);
    const summary = preparatorySummary("SEC-PREP", remoteOnly, data.settings);
    expect(summary.remoteOnly).toBe(true);
    expect(summary.message).toContain("never invented");
    expect(remoteOnly.length).toBe(1);
  });
});

describe("room capacity", () => {
  const data = scheduleFixture();

  it("refuses an unknown capacity without an authorized override", () => {
    const room = data.rooms.find((r) => r.capacity === null)!;
    expect(capacityBlocked(room, { students: 20 })).toContain("Capacity unknown");
    expect(capacityBlocked(room, { students: 20 }, "approved by the dean")).toBeNull();
  });
});

describe("data quality center", () => {
  const data = scheduleFixture();

  it("links every finding to the record it describes", () => {
    const broken = { ...data, assignments: data.assignments.map((a) => (a.id === "A-B-1" ? { ...a, facultyId: "" } : a)) };
    const report = runQualityChecks(broken);
    const issue = report.issues.find((i) => i.category === "missing-faculty")!;
    expect(issue.entity.id).toBe("A-B-1");
    expect(issue.link).toBe("/editor?assignment=A-B-1");
  });

  it("reports an invalid period as a blocking error", () => {
    const broken = { ...data, assignments: [{ ...data.assignments[0], periods: [9, 19] }] };
    const report = runQualityChecks(broken);
    expect(report.issues.some((i) => i.category === "invalid-period" && i.severity === "error")).toBe(true);
    expect(report.blocking).toBe(true);
  });

  it("warns about an unknown room capacity and an unmapped college", () => {
    const report = runQualityChecks({ ...data, collegeMappings: [], assignments: data.assignments.map((a) => ({ ...a, collegeIds: [] })) });
    expect(report.issues.some((i) => i.category === "missing-capacity")).toBe(true);
    expect(report.issues.some((i) => i.category === "unmapped-college")).toBe(true);
  });

  it("separates an in-person meeting with no room from a genuine room clash", () => {
    const roomless = { ...data, assignments: [{ ...data.assignments[0], roomId: null }] };
    const report = runQualityChecks(roomless);
    expect(report.issues.some((i) => i.category === "missing-room" && i.severity === "error")).toBe(true);
    expect(report.issues.some((i) => i.category === "room-conflict")).toBe(false);
  });

  it("reports a blocked source row rather than hiding it", () => {
    const withBlocked = {
      ...data,
      sourceRows: [{ id: "R1", ref: { workbook: "w", sheet: "481", row: 189, column: "J" }, kind: "assignment" as const, raw: {}, status: "blocked" as const, note: "period 19 is out of range" }],
    };
    const report = runQualityChecks(withBlocked);
    const issue = report.issues.find((i) => i.category === "single-sheet-record")!;
    expect(issue.messageEn).toContain("was not imported");
    expect(issue.ref?.row).toBe(189);
  });
});

describe("unscheduled queue", () => {
  const data = scheduleFixture();
  const reason = {
    need: { courseCode: "TSTE1201", sectionId: "SEC-B", activity: "نشاط 3", facultyId: "F-002", requiredPeriods: 2 },
    hardConstraints: ["Room R-1 is already assigned."],
    consideredDays: ["Sunday"],
    rejectedRooms: [{ roomId: "R-2", reason: "Capacity unknown." }],
    thursdayWouldHelp: false,
    overrideRequired: false,
  };

  it("gives each item ranked repair suggestions", () => {
    const repairs = suggestRepairs(data, reason);
    expect(repairs.length).toBeGreaterThan(0);
    expect(repairs[0].rank).toBeLessThanOrEqual(repairs[repairs.length - 1].rank);
    expect(repairs.some((r) => r.kind === "alternative-time")).toBe(true);
  });

  it("suggests entering a capacity for a room skipped only for that reason", () => {
    const repairs = suggestRepairs(data, reason);
    expect(repairs.some((r) => r.kind === "enter-capacity" && r.summary.includes("R-2"))).toBe(true);
  });

  it("never proposes moving a locked assignment", () => {
    const locked = { ...data, assignments: data.assignments.map((a) => ({ ...a, locked: true })) };
    const repairs = suggestRepairs(locked, reason);
    expect(repairs.some((r) => r.kind === "move-other")).toBe(false);
  });

  it("keeps locked assignments in place when a repair is applied", () => {
    const locked = { ...data, assignments: data.assignments.map((a) => ({ ...a, locked: true })) };
    const repair = suggestRepairs(locked, reason).find((r) => r.kind === "alternative-time");
    const next = repair?.apply(locked);
    if (next) {
      for (const before of locked.assignments) {
        const after = next.assignments.find((a) => a.id === before.id)!;
        expect(after.day).toBe(before.day);
        expect(after.periods).toEqual(before.periods);
      }
    }
  });

  it("reports a batch repair honestly when only some items succeed", () => {
    const items = buildQueue(data, [reason]);
    const manual = items[0].repairs.find((r) => r.kind === "enter-capacity")!;
    const automatic = items[0].repairs.find((r) => r.kind === "alternative-time")!;
    const result = batchRepair(data, [
      { itemId: "a", repair: automatic },
      { itemId: "b", repair: manual },
    ]);
    expect(result.applied).toEqual(["a"]);
    expect(result.failed[0].itemId).toBe("b");
    expect(result.partial).toBe(true);
  });
});

describe("change impact preview", () => {
  const data = scheduleFixture();

  it("lists every affected entity", () => {
    const after = { ...data, assignments: data.assignments.map((a) => (a.id === "A-PREP-1" ? { ...a, day: "Wednesday", roomId: "R-2" } : a)) };
    const impact = previewImpact(data, after);
    expect(impact.assignmentsAffected).toContain("A-PREP-1");
    expect(impact.sectionsAffected).toContain("SEC-PREP");
    expect(impact.roomsAffected).toContain("R-2");
    expect(impact.collegesAffected).toContain("COL-A");
  });

  it("reports Thursday and preparatory changes", () => {
    const after = { ...data, assignments: data.assignments.map((a) => (a.id === "A-PREP-3" ? { ...a, day: "Thursday", deliveryMode: "in-person" as const, activity: "نشاط 3" } : a)) };
    const impact = previewImpact(data, after);
    expect(impact.thursdayAfter).toBeGreaterThan(impact.thursdayBefore);
  });

  it("marks exports outdated and invalidates approval on an approved schedule", () => {
    const approved = { ...data, scheduleState: "approved" as const, approvedVersionId: "V1", distributions: [{ id: "P1", collegeId: "COL-A", versionId: "V1", versionName: "v", exportedAt: "", filename: "f.xlsx", assignmentCount: 1, exportedBy: "op", checksum: "c", status: "generated" as const }] };
    const after = { ...approved, assignments: approved.assignments.filter((a) => a.id !== "A-PREP-1") };
    const impact = previewImpact(approved, after);
    expect(impact.approvalInvalidated).toBe(true);
    expect(impact.exportsOutdated.map((e) => e.filename)).toContain("f.xlsx");
    expect(impact.material).toBe(true);
  });
});

describe("approval workflow", () => {
  it("requires zero blocking errors to approve", () => {
    const broken = { ...scheduleFixture(), assignments: [{ ...scheduleFixture().assignments[0], periods: [19] }] };
    const review = sendForReview(broken);
    expect(review.ok).toBe(true);
    const result = approve(review.data);
    expect(result.ok).toBe(false);
    expect(result.blockingErrors).toBeGreaterThan(0);
  });

  it("locks an approved schedule against editing", () => {
    const review = sendForReview(scheduleFixture());
    const approved = approve(review.data);
    expect(approved.ok).toBe(true);
    expect(isLocked(approved.data.scheduleState)).toBe(true);
    expect(guardEdit(approved.data)).toContain("locked");
  });

  it("requires a reason to reopen and creates a new draft version", () => {
    const review = sendForReview(scheduleFixture());
    const approved = approve(review.data);
    expect(reopen(approved.data, "  ").ok).toBe(false);
    const reopened = reopen(approved.data, "a department requested a change");
    expect(reopened.ok).toBe(true);
    expect(reopened.data.scheduleState).toBe("draft");
    expect(reopened.data.approvedVersionId).toBeNull();
    expect(reopened.data.settings.scheduleVersionNumber).toBe(approved.data.settings.scheduleVersionNumber + 1);
    expect(reopened.data.versions[0].reason).toBe("a department requested a change");
    expect(reopened.data.audit[0].reason).toBe("a department requested a change");
  });

  it("marks previously exported packages outdated when reopened", () => {
    const review = sendForReview(scheduleFixture());
    const approved = approve(review.data);
    const withPackage = recordPackage(approved.data, { collegeId: "COL-A", filename: "f.xlsx", assignmentCount: 4, bytes: new Uint8Array([1, 2, 3]) });
    const reopened = reopen(withPackage.data, "room change");
    expect(reopened.data.distributions[0].status).toBe("outdated");
  });

  it("blocks bulk edits while the schedule is locked", () => {
    const review = sendForReview(scheduleFixture());
    const approved = approve(review.data);
    const result = applyBulk(approved.data, ["A-PREP-1"], { kind: "set-lock", locked: true });
    expect(result.applied).toBe(0);
    expect(result.blocked).toBe(1);
    expect(result.outcomes[0].message).toContain("locked");
  });
});

describe("what-if sandbox", () => {
  it("never overwrites the master schedule until promoted", () => {
    const data = scheduleFixture();
    const scenario = cloneIntoScenario(data, "fewer Thursdays");
    const withScenario = { ...data, scenarios: [scenario] };
    scenario.assignments = scenario.assignments.filter((a) => a.id !== "A-PREP-1");
    expect(withScenario.assignments.length).toBe(4);

    const discarded = discardScenario(withScenario, scenario.id);
    expect(discarded.assignments.length).toBe(4);
    expect(discarded.scenarios).toHaveLength(0);
  });

  it("promotes a scenario into a new draft after backing the current one up", () => {
    const data = scheduleFixture();
    const scenario = cloneIntoScenario(data, "alternative");
    scenario.assignments = scenario.assignments.filter((a) => a.id !== "A-PREP-1");
    const promoted = promoteScenario({ ...data, scenarios: [scenario] }, scenario.id);
    expect(promoted.data.assignments.length).toBe(3);
    expect(promoted.data.versions[0].assignments.length).toBe(4);
    expect(promoted.data.scheduleState).toBe("draft");
  });

  it("measures scenarios so up to three can be compared", () => {
    const data = scheduleFixture();
    const scenario = cloneIntoScenario(data, "baseline");
    const metrics = scenarioMetrics(data, scenario, 6);
    expect(metrics.remoteMeetings).toBe(1);
    expect(metrics.thursdayInPerson).toBe(0);
    expect(metrics.unscheduled).toBe(2);
  });
});

describe("bulk editing", () => {
  const data = scheduleFixture();

  it("refuses to put a room on a remote meeting", () => {
    const result = applyBulk(data, ["A-PREP-2"], { kind: "assign-room", roomId: "R-1" });
    expect(result.blocked).toBe(1);
    expect(result.outcomes[0].message).toContain("delivered remotely");
  });

  it("separates applied, blocked, and warned records", () => {
    const result = applyBulk(data, ["A-PREP-1", "A-PREP-2", "MISSING"], { kind: "assign-college", collegeIds: ["COL-B"] });
    expect(result.applied).toBeGreaterThan(0);
    expect(result.blocked).toBe(1);
    expect(result.partial).toBe(true);
  });

  it("never moves a locked assignment", () => {
    const locked = { ...data, assignments: data.assignments.map((a) => (a.id === "A-PREP-1" ? { ...a, locked: true } : a)) };
    const result = applyBulk(locked, ["A-PREP-1"], { kind: "move", day: "Wednesday", periods: [1, 2] });
    expect(result.blocked).toBe(1);
    expect(result.data.assignments.find((a) => a.id === "A-PREP-1")?.day).toBe("Sunday");
  });

  it("sets a room capacity that was previously unknown", () => {
    const result = applyBulk(data, ["R-2"], { kind: "set-capacity", capacity: 35 });
    expect(result.applied).toBe(1);
    expect(result.data.rooms.find((r) => r.id === "R-2")?.capacity).toBe(35);
  });
});

describe("semester cloning", () => {
  it("does not modify the source semester", () => {
    const source = scheduleFixture();
    const snapshot = JSON.stringify(source);
    const cloned = cloneSemester(source, "1449", DEFAULT_CLONE_OPTIONS);
    expect(JSON.stringify(source)).toBe(snapshot);
    expect(cloned.settings.semester).toBe("1449");
  });

  it("starts as a draft and is never approved automatically", () => {
    const cloned = cloneSemester({ ...scheduleFixture(), scheduleState: "approved", approvedVersionId: "V1" }, "1449");
    expect(cloned.scheduleState).toBe("draft");
    expect(cloned.approvedVersionId).toBeNull();
    expect(cloned.assignments).toHaveLength(0);
    expect(cloned.versions).toHaveLength(0);
  });

  it("copies reference data the administrator asked for", () => {
    const cloned = cloneSemester(scheduleFixture(), "1449", { ...DEFAULT_CLONE_OPTIONS, rooms: true, faculty: true, collegeMappings: true });
    expect(cloned.faculty).toHaveLength(2);
    expect(cloned.rooms).toHaveLength(2);
    expect(cloned.collegeMappings).toHaveLength(2);
  });
});

describe("version comparison", () => {
  const data = scheduleFixture();

  it("detects every change type", () => {
    const after = data.assignments
      .filter((a) => a.id !== "A-B-1")
      .map((a) =>
        a.id === "A-PREP-1"
          ? { ...a, facultyId: "F-002", day: "Wednesday", roomId: "R-2", periods: [5, 6], locked: true, deliveryMode: "remote" as const, collegeIds: ["COL-B"] }
          : a,
      )
      .concat([{ ...data.assignments[0], id: "NEW" }]);
    const diff = diffSchedules(data.assignments, after, { before: "draft", after: "approved" });
    expect(diff.counts.faculty).toBe(1);
    expect(diff.counts.day).toBe(1);
    expect(diff.counts.room).toBe(1);
    expect(diff.counts.time).toBe(1);
    expect(diff.counts.lock).toBe(1);
    expect(diff.counts.delivery).toBe(1);
    expect(diff.counts.college).toBe(1);
    expect(diff.counts.added).toBe(1);
    expect(diff.counts.removed).toBe(1);
    expect(diff.stateChange?.after).toBe("approved");
  });
});

describe("calendar export", () => {
  const data = scheduleFixture();

  it("is disabled with a clear explanation while clock times are incomplete", () => {
    expect(clockTimesComplete(data.settings)).toBe(false);
    const gate = icsGate(data);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("الفترة");
    expect(() => buildIcs(data, data.assignments, { versionId: "V1" })).toThrow();
  });

  it("produces stable UIDs and Asia/Riyadh times once configured", () => {
    const configured = { ...data, settings: { ...data.settings, periods: data.settings.periods.map((p) => ({ ...p, confirmed: true })) } };
    expect(icsGate(configured).allowed).toBe(true);
    const anchor = new Date(Date.UTC(2026, 0, 4));
    const first = buildIcs(configured, configured.assignments, { versionId: "V1", anchorDate: anchor });
    const again = buildIcs(configured, configured.assignments, { versionId: "V1", anchorDate: anchor });
    expect(first).toBe(again);
    expect(first).toContain("TZID:Asia/Riyadh");
    expect(first).toContain(eventUid("V1", configured.assignments[0]));
    expect(first).toContain("RRULE:FREQ=WEEKLY");
    // Remote meetings carry عن بُعد as their location.
    expect(first).toContain("عن بُعد");
    const uids = first.split("\r\n").filter((l) => l.startsWith("UID:"));
    expect(new Set(uids).size).toBe(uids.length);
  });
});

describe("college isolation and export", () => {
  const data = scheduleFixture();

  it("gives each college only its own records", () => {
    const a = collegeSlice(data, "COL-A");
    const b = collegeSlice(data, "COL-B");
    expect(a.assignments.every((x) => collegesForAssignment(data, x).includes("COL-A"))).toBe(true);
    expect(a.assignments.some((x) => x.id === "A-B-1")).toBe(false);
    expect(b.assignments.map((x) => x.id)).toEqual(["A-B-1"]);
    expect(a.faculty.map((f) => f.id)).toEqual(["F-001"]);
    expect(b.faculty.map((f) => f.id)).toEqual(["F-002"]);
  });

  it("writes a college workbook containing no other college's records", () => {
    const result = buildCollegeWorkbook(data, "COL-A");
    const wb = XLSX.read(result.bytes, { type: "array" });
    expect(wb.SheetNames).toEqual(["ملخص", "الجدول الموحد", "جداول الأقسام", "جداول الشعب", "القاعات المستخدمة", "ملاحظات"]);
    const text = XLSX.utils.sheet_to_csv(wb.Sheets["الجدول الموحد"]);
    expect(text).toContain("قسم تجريبي");
    expect(text).not.toContain("قسم ثان");
    expect(text).toContain("عن بُعد");
    const rooms = XLSX.utils.sheet_to_csv(wb.Sheets["القاعات المستخدمة"]);
    expect(rooms).toContain("25-1.001");
    expect(rooms).not.toContain("24-0.001");
  });

  it("uses a safe Arabic filename carrying the version and semester", () => {
    const result = buildCollegeWorkbook(data, "COL-A");
    expect(result.filename).toMatch(/^جداول_.*_1448_الإصدار_1\.xlsx$/);
  });

  it("labels shared sections مشترك and keeps the master link", () => {
    const shared = {
      ...data,
      assignments: data.assignments.map((a) => (a.id === "A-PREP-1" ? { ...a, collegeIds: ["COL-A", "COL-B"], masterAssignmentId: "A-PREP-1" } : a)),
    };
    const wb = XLSX.read(buildCollegeWorkbook(shared, "COL-B").bytes, { type: "array" });
    expect(XLSX.utils.sheet_to_csv(wb.Sheets["الجدول الموحد"])).toContain("مشترك");
    expect(XLSX.utils.sheet_to_csv(wb.Sheets["ملاحظات"])).toContain("شعبة مشتركة");
  });

  it("blocks bulk export while an assignment has no college", () => {
    const unmapped = { ...data, collegeMappings: [], assignments: data.assignments.map((a) => ({ ...a, collegeIds: [] })) };
    expect(unmappedAssignments(unmapped).length).toBe(4);
    const gate = bulkExportGate(unmapped);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("غير مصنف");
  });

  it("lets an explicitly unclassified assignment through", () => {
    const filed = { ...data, assignments: data.assignments.map((a) => ({ ...a, collegeIds: [UNCLASSIFIED_COLLEGE_ID] })) };
    expect(bulkExportGate(filed).allowed).toBe(true);
  });

  it("bundles one workbook per college into a ZIP", () => {
    const { exports, zip, filename } = buildAllColleges(data);
    expect(exports.map((e) => e.collegeId).sort()).toEqual(["COL-A", "COL-B"]);
    expect(filename).toContain(".zip");
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

describe("distribution log", () => {
  const data = scheduleFixture();

  it("records a package with a stable identifier and never claims it was sent", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { data: next, pkg } = recordPackage(data, { collegeId: "COL-A", filename: "f.xlsx", assignmentCount: 3, bytes });
    expect(pkg.status).toBe("generated");
    expect(pkg.checksum).toBe(checksum(bytes));
    expect(next.distributions).toHaveLength(1);
    const delivered = markDelivered(next, pkg.id);
    expect(delivered.distributions[0].status).toBe("delivered");
  });

  it("warns when a college has not received the approved version", () => {
    const warnings = distributionWarnings(data);
    expect(warnings.some((w) => w.message.includes("has not received"))).toBe(true);
  });

  it("marks an earlier package for the same college as replaced", () => {
    const first = recordPackage(data, { collegeId: "COL-A", filename: "a.xlsx", assignmentCount: 1, bytes: new Uint8Array([1]) });
    const second = recordPackage(first.data, { collegeId: "COL-A", filename: "b.xlsx", assignmentCount: 1, bytes: new Uint8Array([2]) });
    expect(second.data.distributions[1].status).toBe("replaced");
  });
});

describe("travel time", () => {
  it("reports a precise conflict when two buildings are too far apart", () => {
    const data = scheduleFixture();
    const withRule = {
      ...data,
      travelRules: [{ id: "T1", fromBuilding: "المبنى الرئيسي", toBuilding: "ق2", minutes: 45, hard: true, scope: "building" as const }],
      assignments: [
        { ...data.assignments[0], id: "T-A", day: "Sunday", periods: [1, 2], roomId: "R-1", facultyId: "F-001" },
        { ...data.assignments[0], id: "T-B", day: "Sunday", periods: [3, 4], roomId: "R-2", facultyId: "F-001" },
      ],
    };
    const conflicts = travelConflicts(withRule, withRule.assignments, "F-001");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].requiredMinutes).toBe(45);
    expect(conflicts[0].message).toContain("المبنى الرئيسي");
    expect(conflicts[0].hard).toBe(true);
    expect(conflictsFor(withRule.assignments[1], withRule.assignments, withRule).some((c) => c.type === "travel")).toBe(true);
  });

  it("leaves remote meetings out unless configured otherwise", () => {
    const data = scheduleFixture();
    const withRule = { ...data, travelRules: [{ id: "T1", fromBuilding: "المبنى الرئيسي", toBuilding: "ق2", minutes: 45, hard: true, scope: "building" as const }] };
    expect(travelConflicts(withRule, withRule.assignments, "F-001")).toHaveLength(0);
  });
});

describe("workload distribution report", () => {
  it("shows the values behind every figure and publishes the index formula", () => {
    const data = scheduleFixture();
    const report = fairnessReport(data);
    const row = report.rows.find((r) => r.facultyId === "F-001")!;
    expect(row.inPersonUnits + row.remoteUnits).toBe(row.assignedUnits);
    expect(row.teachingDays).toBe(3);
    expect(row.thursdayAssignments).toBe(1);
    expect(distributionIndex(row, DEFAULT_INDEX_WEIGHTS)).toBeGreaterThanOrEqual(0);
    // Weights are configurable, so the index is never a fixed hidden score.
    expect(distributionIndex(row, { ...DEFAULT_INDEX_WEIGHTS, thursday: 10 })).toBeGreaterThan(distributionIndex(row, { ...DEFAULT_INDEX_WEIGHTS, thursday: 0 }));
  });
});

describe("persistence and demo preservation", () => {
  it("keeps the demo dataset counts unchanged", () => {
    const demo = createDemoData();
    expect(demo.faculty).toHaveLength(12);
    expect(demo.courses).toHaveLength(15);
    expect(demo.sections).toHaveLength(10);
    expect(demo.rooms).toHaveLength(8);
    expect(demo.assignments).toHaveLength(2);
    expect(demo.settings.programs).toHaveLength(6);
  });

  it("migrates older stored data without losing records", () => {
    const older = createDemoData() as AppData & { colleges?: unknown };
    older.schemaVersion = 0;
    delete (older as Partial<AppData>).colleges;
    delete (older as Partial<AppData>).coursePatterns;
    const migrated = migrate(older);
    expect(migrated.faculty).toHaveLength(12);
    expect(migrated.assignments).toHaveLength(2);
    expect(migrated.colleges.length).toBeGreaterThan(0);
    expect(migrated.settings.periods).toHaveLength(12);
    expect(migrated.schemaVersion).toBe(4);
  });

  it("keeps a room with an unknown capacity as null rather than zero", () => {
    const migrated = migrate({ ...createDemoData(), rooms: [{ ...createDemoData().rooms[0], capacity: undefined as unknown as number }] });
    expect(migrated.rooms[0].capacity).toBeNull();
  });
});

describe("the demo dataset's unscheduled count", () => {
  it("is the gap between required and stored meetings, not a scheduling failure", () => {
    const data = createDemoData();
    const required = data.sections.reduce(
      (n, s) => n + s.courseCodes.reduce((x, c) => x + (data.courses.find((k) => k.code === c)?.meetingsPerWeek ?? 0), 0),
      0,
    );
    // The dashboard shows required minus stored, which is why the demo starts
    // with 25 unscheduled: it ships two seeded meetings out of twenty-seven.
    expect(required).toBe(27);
    expect(data.assignments).toHaveLength(2);
    expect(required - data.assignments.length).toBe(25);

    // The generator can place every one of them, so nothing is unsatisfiable.
    const result = generate(data, "balanced");
    expect(result.ok).toBe(true);
    expect(result.unscheduled).toHaveLength(0);
    expect(result.assignments).toHaveLength(required);
  });

  it("counts a locked meeting toward its own weekly requirement exactly once", () => {
    const data = createDemoData();
    const result = generate(data, "balanced");
    expect(result.assignments.filter((a) => a.id === "A-001")).toHaveLength(1);
    const lockedCourseSection = result.assignments.filter((a) => a.courseCode === data.assignments[0].courseCode && a.sectionId === data.assignments[0].sectionId);
    const course = data.courses.find((c) => c.code === data.assignments[0].courseCode)!;
    expect(lockedCourseSection).toHaveLength(course.meetingsPerWeek);
  });
});
