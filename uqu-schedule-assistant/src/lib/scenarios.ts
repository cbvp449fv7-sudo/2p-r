/**
 * What-if sandbox.
 *
 * A scenario is a labelled copy of the schedule. Nothing in it reaches the
 * master schedule until an administrator explicitly promotes it.
 */

import type { AppData, Scenario, ScheduleVersion } from "./types";
import { allConflicts } from "./engine";
import { loadSummary } from "./rules";
import { isRemote, physicalThursdayCount } from "./schedule-rules";
import { occupiesRoom } from "./schedule-rules";

export function cloneIntoScenario(data: AppData, name: string): Scenario {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || `Scenario ${data.scenarios.length + 1}`,
    createdAt: new Date().toISOString(),
    baseVersionId: data.approvedVersionId,
    assignments: structuredClone(data.assignments),
    weights: { ...data.settings.weights },
  };
}

export type ScenarioMetrics = {
  scenarioId: string;
  name: string;
  conflicts: number;
  overtimeUnits: number;
  facultyGaps: number;
  thursdayInPerson: number;
  thursdayRemote: number;
  roomsUsed: number;
  unscheduled: number;
  remoteMeetings: number;
};

/** Metrics used when comparing up to three scenarios side by side. */
export function scenarioMetrics(data: AppData, scenario: Scenario, requiredMeetings: number): ScenarioMetrics {
  const probe: AppData = { ...data, assignments: scenario.assignments, settings: { ...data.settings, weights: scenario.weights } };
  const loads = data.faculty.map((f) => loadSummary(f, scenario.assignments, data.settings));
  const byFacultyDay = new Map<string, number[]>();
  for (const a of scenario.assignments) {
    const key = `${a.facultyId}|${a.day}`;
    byFacultyDay.set(key, [...(byFacultyDay.get(key) ?? []), ...(a.periods ?? [])]);
  }
  let gaps = 0;
  for (const periods of byFacultyDay.values()) {
    const sorted = [...new Set(periods)].sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i += 1) gaps += Math.max(0, sorted[i] - sorted[i - 1] - 1);
  }
  return {
    scenarioId: scenario.id,
    name: scenario.name,
    conflicts: allConflicts(probe).length,
    overtimeUnits: loads.reduce((n, l) => n + l.overtime, 0),
    facultyGaps: gaps,
    thursdayInPerson: physicalThursdayCount(scenario.assignments),
    thursdayRemote: scenario.assignments.filter((a) => a.day === "Thursday" && isRemote(a)).length,
    roomsUsed: new Set(scenario.assignments.filter(occupiesRoom).map((a) => a.roomId)).size,
    unscheduled: Math.max(0, requiredMeetings - scenario.assignments.length),
    remoteMeetings: scenario.assignments.filter(isRemote).length,
  };
}

/** Promote a scenario into a new draft version, leaving the approved one intact. */
export function promoteScenario(data: AppData, scenarioId: string): { data: AppData; message: string } {
  const scenario = data.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return { data, message: "Scenario not found." };
  const version: ScheduleVersion = {
    id: crypto.randomUUID(),
    name: `Promoted from scenario: ${scenario.name}`,
    date: new Date().toISOString(),
    author: data.settings.operatorName,
    operator: data.settings.operatorName,
    summary: "Backup of the schedule that was active before the scenario was promoted",
    conflicts: allConflicts(data).length,
    score: 0,
    status: "archived",
    state: data.scheduleState,
    assignments: structuredClone(data.assignments),
  };
  return {
    data: {
      ...data,
      assignments: structuredClone(scenario.assignments),
      settings: { ...data.settings, weights: { ...scenario.weights } },
      versions: [version, ...data.versions],
      scheduleState: "draft",
      approvedVersionId: null,
    },
    message: `Promoted "${scenario.name}" into a new draft. The previous schedule was saved as a version first.`,
  };
}

export function discardScenario(data: AppData, scenarioId: string): AppData {
  return { ...data, scenarios: data.scenarios.filter((s) => s.id !== scenarioId) };
}
