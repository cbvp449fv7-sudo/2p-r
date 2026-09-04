/**
 * Distribution log.
 *
 * Records every package generated locally. Nothing is emailed or uploaded, and
 * the log never claims a file was sent automatically.
 */

import type { AppData, DistributionPackage } from "./types";
import { collegeName } from "./colleges";

/** Small stable checksum over the exported bytes, for package identity. */
export function checksum(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i += 1) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193) >>> 0;
    h2 = Math.imul(h2 + bytes[i] + 1, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export function recordPackage(
  data: AppData,
  entry: { collegeId: string; filename: string; assignmentCount: number; bytes: Uint8Array },
): { data: AppData; pkg: DistributionPackage } {
  const version = data.versions.find((v) => v.id === data.approvedVersionId);
  const pkg: DistributionPackage = {
    id: crypto.randomUUID(),
    collegeId: entry.collegeId,
    versionId: data.approvedVersionId ?? "draft",
    versionName: version?.name ?? `Draft (version ${data.settings.scheduleVersionNumber})`,
    exportedAt: new Date().toISOString(),
    filename: entry.filename,
    assignmentCount: entry.assignmentCount,
    exportedBy: data.settings.operatorName,
    checksum: checksum(entry.bytes),
    status: "generated",
  };
  // An earlier package for the same college is superseded by this one.
  const replaced = data.distributions.map((p) => (p.collegeId === entry.collegeId && p.status !== "outdated" ? { ...p, status: "replaced" as const } : p));
  return { data: { ...data, distributions: [pkg, ...replaced] }, pkg };
}

export function markDelivered(data: AppData, packageId: string): AppData {
  return {
    ...data,
    distributions: data.distributions.map((p) => (p.id === packageId ? { ...p, status: "delivered" as const } : p)),
  };
}

export type DistributionWarning = { collegeId: string; severity: "warning" | "info"; message: string };

/** Warnings about stale or repeated packages, in plain language. */
export function distributionWarnings(data: AppData, locale: "ar" | "en" = "en"): DistributionWarning[] {
  const out: DistributionWarning[] = [];
  const approved = data.approvedVersionId;
  const collegesWithAssignments = new Set(data.assignments.flatMap((a) => a.collegeIds ?? []));

  for (const college of data.colleges) {
    if (!collegesWithAssignments.has(college.id)) continue;
    const own = data.distributions.filter((p) => p.collegeId === college.id);
    const name = collegeName(data.colleges, college.id, locale);
    if (!own.length) {
      out.push({
        collegeId: college.id,
        severity: "warning",
        message: locale === "ar" ? `لم تستلم ${name} أي نسخة من الإصدار المعتمد الحالي.` : `${name} has not received the current approved version.`,
      });
      continue;
    }
    const latest = own[0];
    if (approved && latest.versionId !== approved) {
      out.push({
        collegeId: college.id,
        severity: "warning",
        message: locale === "ar" ? `يوجد إصدار معتمد أحدث من النسخة المرسلة إلى ${name}.` : `A newer approved version exists than the package sent to ${name}.`,
      });
    }
    if (latest.status === "outdated") {
      out.push({
        collegeId: college.id,
        severity: "warning",
        message: locale === "ar" ? `حزمة ${name} أصبحت قديمة بعد تعديل الجدول.` : `${name}'s package became outdated after the schedule changed.`,
      });
    }
    if (own.length > 1 && own[0].versionId === own[1].versionId) {
      out.push({
        collegeId: college.id,
        severity: "info",
        message: locale === "ar" ? `${name} على وشك استلام الإصدار نفسه مرة أخرى.` : `${name} is about to receive the same version again.`,
      });
    }
  }
  return out;
}
