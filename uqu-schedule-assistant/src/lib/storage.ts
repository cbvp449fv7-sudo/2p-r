import { get, set, del } from "idb-keyval";
import type { AppData } from "./types";
import { createDemoData, defaultColleges, defaultSettings } from "./demo";
import { defaultPeriodTable } from "./period-table";

const KEY = "uqu-schedule-assistant:data:v3";
const SNAPSHOT_KEY = "uqu-schedule-assistant:snapshots:v1";
export const SCHEMA_VERSION = 4;

export async function loadData() {
  const stored = await get<AppData>(KEY);
  return migrate(stored ?? createDemoData());
}

export async function saveData(data: AppData) {
  await set(KEY, data);
}

export async function clearData() {
  await del(KEY);
}

/**
 * Bring stored data up to the current schema.
 * Records are never dropped: missing collections default to empty and missing
 * per-record fields are filled in, so counts stay the same across upgrades.
 */
export function migrate(data: AppData): AppData {
  const base = createDemoData();
  const settings = { ...defaultSettings(), ...(data.settings ?? {}) };
  if (!Array.isArray(settings.periods) || !settings.periods.length) settings.periods = defaultPeriodTable();
  if (!settings.titleLoadMap) settings.titleLoadMap = defaultSettings().titleLoadMap;

  return {
    ...base,
    ...data,
    schemaVersion: SCHEMA_VERSION,
    settings,
    colleges: data.colleges?.length ? data.colleges : defaultColleges(),
    collegeMappings: data.collegeMappings ?? [],
    coursePatterns: data.coursePatterns ?? [],
    facultyAliases: data.facultyAliases ?? [],
    roomColorProfiles: data.roomColorProfiles ?? [],
    travelRules: data.travelRules ?? [],
    distributions: data.distributions ?? [],
    scenarios: data.scenarios ?? [],
    scheduleState: data.scheduleState ?? "draft",
    approvedVersionId: data.approvedVersionId ?? null,
    sourceRows: data.sourceRows ?? [],
    rooms: (data.rooms ?? base.rooms).map((room) => ({
      ...room,
      capacity: room.capacity === undefined ? null : room.capacity,
    })),
    assignments: (data.assignments ?? []).map((assignment) => ({
      ...assignment,
      roomId: assignment.roomId ?? null,
      deliveryMode: assignment.deliveryMode ?? (assignment.roomId ? "in-person" : "in-person"),
      periods: assignment.periods ?? [],
      collegeIds: assignment.collegeIds ?? [],
    })),
  };
}

/* -------------------------------------------------------------- snapshots */

export type Snapshot = { id: string; at: string; label: string; data: AppData };

/** A restorable copy taken before every import, migration, or bulk change. */
export async function createSnapshot(label: string, data: AppData): Promise<Snapshot> {
  const snapshot: Snapshot = { id: `SNAP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), label, data: structuredClone(data) };
  const all = (await get<Snapshot[]>(SNAPSHOT_KEY)) ?? [];
  // Keep the most recent snapshots so a rollback is always available without
  // letting local storage grow without bound.
  await set(SNAPSHOT_KEY, [snapshot, ...all].slice(0, 20));
  return snapshot;
}

export async function listSnapshots(): Promise<Snapshot[]> {
  return (await get<Snapshot[]>(SNAPSHOT_KEY)) ?? [];
}

export async function restoreSnapshot(id: string): Promise<AppData | null> {
  const all = await listSnapshots();
  const found = all.find((s) => s.id === id);
  if (!found) return null;
  await saveData(found.data);
  return migrate(found.data);
}

export async function deleteSnapshot(id: string) {
  const all = await listSnapshots();
  await set(SNAPSHOT_KEY, all.filter((s) => s.id !== id));
}
