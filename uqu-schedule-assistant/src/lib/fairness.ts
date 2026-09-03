/**
 * Workload distribution report.
 *
 * This is decision support, not an employment judgement. Every number is shown
 * with the values behind it, the optional summary index publishes its formula
 * and configurable weights, and no one is labelled unfair or underperforming.
 */

import type { AppData, Assignment, Faculty } from "./types";
import { loadSummary } from "./rules";
import { isRemote, physicalThursdayCount, travelConflicts } from "./schedule-rules";

export type FairnessRow = {
  facultyId: string;
  nameAr: string;
  nameEn: string;
  normalLoad: number;
  reducedLoad: number | null;
  effectiveLoad: number;
  assignedUnits: number;
  regular: number;
  preparatory: number;
  additional: number;
  remoteUnits: number;
  inPersonUnits: number;
  overtime: number;
  teachingDays: number;
  thursdayAssignments: number;
  earlySessions: number;
  lateSessions: number;
  weeklyGaps: number;
  maxConsecutive: number;
  buildingTransitions: number;
  explicitLoads: boolean;
};

export const DEFAULT_INDEX_WEIGHTS = {
  loadDeviation: 1,
  gaps: 0.5,
  thursday: 1,
  transitions: 0.5,
  earlyLate: 0.25,
};

export type IndexWeights = typeof DEFAULT_INDEX_WEIGHTS;

/**
 * Optional summary index. Lower means closer to the configured targets.
 * The formula is published so the number can be checked by hand.
 */
export const INDEX_FORMULA =
  "index = w1·|assigned − effective load| + w2·(weekly gaps) + w3·(Thursday assignments) + w4·(building transitions) + w5·(early + late sessions)";

export function distributionIndex(row: FairnessRow, weights: IndexWeights = DEFAULT_INDEX_WEIGHTS): number {
  return (
    weights.loadDeviation * Math.abs(row.assignedUnits - row.effectiveLoad) +
    weights.gaps * row.weeklyGaps +
    weights.thursday * row.thursdayAssignments +
    weights.transitions * row.buildingTransitions +
    weights.earlyLate * (row.earlySessions + row.lateSessions)
  );
}

function periodsOf(a: Assignment): number[] {
  return a.periods?.length ? a.periods : [];
}

export function fairnessRow(data: AppData, person: Faculty): FairnessRow {
  const own = data.assignments.filter((a) => a.facultyId === person.id);
  const summary = loadSummary(person, data.assignments, data.settings);
  const byDay = new Map<string, number[]>();
  for (const a of own) byDay.set(a.day, [...(byDay.get(a.day) ?? []), ...periodsOf(a)]);

  let gaps = 0;
  let maxConsecutive = 0;
  for (const periods of byDay.values()) {
    const sorted = [...new Set(periods)].sort((a, b) => a - b);
    let run = sorted.length ? 1 : 0;
    for (let i = 1; i < sorted.length; i += 1) {
      const step = sorted[i] - sorted[i - 1];
      if (step === 1) run += 1;
      else {
        gaps += step - 1;
        maxConsecutive = Math.max(maxConsecutive, run);
        run = 1;
      }
    }
    maxConsecutive = Math.max(maxConsecutive, run);
  }

  const firstPeriod = data.settings.periods[0]?.period ?? 1;
  const lastPeriod = data.settings.periods[data.settings.periods.length - 1]?.period ?? 12;

  return {
    facultyId: person.id,
    nameAr: person.nameAr,
    nameEn: person.nameEn,
    normalLoad: person.workbookLoads?.normal ?? person.normalLimit,
    reducedLoad: person.reducedLoad ?? null,
    effectiveLoad: summary.limit,
    assignedUnits: summary.assigned,
    regular: summary.regular,
    preparatory: summary.preparatory,
    additional: summary.additional,
    remoteUnits: summary.remoteUnits,
    inPersonUnits: summary.inPersonUnits,
    overtime: summary.overtime,
    teachingDays: byDay.size,
    thursdayAssignments: own.filter((a) => a.day === "Thursday").length,
    earlySessions: own.filter((a) => periodsOf(a).includes(firstPeriod)).length,
    lateSessions: own.filter((a) => periodsOf(a).includes(lastPeriod)).length,
    weeklyGaps: gaps,
    maxConsecutive,
    buildingTransitions: travelConflicts(data, data.assignments, person.id).length,
    explicitLoads: summary.explicitLoads,
  };
}

export function fairnessReport(data: AppData): { rows: FairnessRow[]; totals: { thursdayInPerson: number; remoteMeetings: number; overtimeUnits: number } } {
  const rows = data.faculty.map((f) => fairnessRow(data, f)).sort((a, b) => b.assignedUnits - a.assignedUnits);
  return {
    rows,
    totals: {
      thursdayInPerson: physicalThursdayCount(data.assignments),
      remoteMeetings: data.assignments.filter(isRemote).length,
      overtimeUnits: rows.reduce((n, r) => n + r.overtime, 0),
    },
  };
}
