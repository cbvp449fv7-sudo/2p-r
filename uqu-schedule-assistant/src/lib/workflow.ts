/**
 * Approval and publication workflow.
 *
 * The app has no authentication, so it records a configurable local operator
 * name rather than pretending an identity was verified.
 */

import type { AppData, ScheduleState, ScheduleVersion } from "./types";
import { runQualityChecks } from "./quality";

export const STATE_ORDER: ScheduleState[] = ["draft", "review", "approved", "distributed", "superseded"];

export const STATE_LABELS: Record<ScheduleState, { en: string; ar: string }> = {
  draft: { en: "Draft", ar: "مسودة" },
  review: { en: "Under review", ar: "قيد المراجعة" },
  approved: { en: "Approved", ar: "معتمد" },
  distributed: { en: "Distributed", ar: "موزّع" },
  superseded: { en: "Superseded", ar: "ملغى بإصدار أحدث" },
};

/** Approved and distributed schedules are locked against accidental editing. */
export function isLocked(state: ScheduleState): boolean {
  return state === "approved" || state === "distributed";
}

export type TransitionResult = { ok: boolean; data: AppData; message: string; blockingErrors?: number };

function snapshot(data: AppData, name: string, state: ScheduleState, reason?: string): ScheduleVersion {
  return {
    id: crypto.randomUUID(),
    name,
    date: new Date().toISOString(),
    author: data.settings.operatorName,
    operator: data.settings.operatorName,
    summary: reason ?? `Snapshot taken on entering ${STATE_LABELS[state].en}`,
    conflicts: 0,
    score: 0,
    status: state === "approved" ? "active" : "draft",
    state,
    reason,
    assignments: structuredClone(data.assignments),
  };
}

export function sendForReview(data: AppData): TransitionResult {
  if (data.scheduleState !== "draft") {
    return { ok: false, data, message: `Only a draft can be sent for review. The schedule is currently ${STATE_LABELS[data.scheduleState].en}.` };
  }
  const version = snapshot(data, `Sent for review — version ${data.settings.scheduleVersionNumber}`, "review");
  return {
    ok: true,
    data: { ...data, scheduleState: "review", versions: [version, ...data.versions] },
    message: "Sent for review. A version snapshot was created.",
  };
}

export function approve(data: AppData): TransitionResult {
  if (data.scheduleState !== "review") {
    return { ok: false, data, message: "Send the schedule for review before approving it." };
  }
  const report = runQualityChecks(data);
  if (report.counts.error > 0) {
    return { ok: false, data, message: `Approval needs zero blocking errors. The Data Quality Center reports ${report.counts.error}.`, blockingErrors: report.counts.error };
  }
  const version = snapshot(data, `Approved — version ${data.settings.scheduleVersionNumber}`, "approved");
  return {
    ok: true,
    data: { ...data, scheduleState: "approved", approvedVersionId: version.id, versions: [version, ...data.versions] },
    message: "Approved and locked against accidental editing.",
  };
}

export function distribute(data: AppData): TransitionResult {
  if (data.scheduleState !== "approved") {
    return { ok: false, data, message: "Only an approved schedule can be recorded as distributed." };
  }
  return { ok: true, data: { ...data, scheduleState: "distributed" }, message: "Recorded as distributed. The exact approved version is stored with each package." };
}

/** Reopening needs a written reason and always creates a new draft version. */
export function reopen(data: AppData, reason: string): TransitionResult {
  if (!isLocked(data.scheduleState)) {
    return { ok: false, data, message: "The schedule is already editable." };
  }
  if (!reason.trim()) {
    return { ok: false, data, message: "A reason is required to reopen an approved schedule." };
  }
  const superseded = data.versions.map((v) => (v.id === data.approvedVersionId ? { ...v, state: "superseded" as ScheduleState, status: "archived" as const } : v));
  const version = snapshot(data, `Reopened draft — version ${data.settings.scheduleVersionNumber + 1}`, "draft", reason.trim());
  const outdated = data.distributions.map((p) => (p.status === "generated" || p.status === "delivered" ? { ...p, status: "outdated" as const } : p));
  return {
    ok: true,
    data: {
      ...data,
      scheduleState: "draft",
      approvedVersionId: null,
      versions: [version, ...superseded],
      distributions: outdated,
      settings: { ...data.settings, scheduleVersionNumber: data.settings.scheduleVersionNumber + 1 },
      audit: [{ id: crypto.randomUUID(), at: new Date().toISOString(), action: "Reopened an approved schedule", reason: reason.trim() }, ...data.audit],
    },
    message: "Reopened as a new draft. Previous college exports are marked outdated.",
  };
}

/** Guard used by every editing path. */
export function guardEdit(data: AppData): string | null {
  if (!isLocked(data.scheduleState)) return null;
  return `The schedule is ${STATE_LABELS[data.scheduleState].en} and locked. Reopen it with a reason before editing.`;
}
