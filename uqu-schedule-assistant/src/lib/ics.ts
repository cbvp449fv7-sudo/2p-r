/**
 * Calendar export.
 *
 * Export stays disabled until every period carries a confirmed clock time,
 * because an ICS file with invented times would be worse than none. UIDs are
 * derived from the approved version and the assignment, so regenerating the
 * same version never produces duplicates.
 */

import type { AppData, Assignment } from "./types";
import { REMOTE_LABEL_AR } from "./types";
import { clockTimesComplete, missingClockTimes, periodsToRange } from "./period-table";
import { collegeName, collegesForAssignment } from "./colleges";
import { isRemote } from "./schedule-rules";

export const TIMEZONE = "Asia/Riyadh";

const DAY_TO_ICS: Record<string, string> = { Sunday: "SU", Monday: "MO", Tuesday: "TU", Wednesday: "WE", Thursday: "TH" };

export type IcsGate = { allowed: boolean; reason: string; missingPeriods: number[] };

export function icsGate(data: Pick<AppData, "settings">): IcsGate {
  if (clockTimesComplete(data.settings)) return { allowed: true, reason: "", missingPeriods: [] };
  const missing = missingClockTimes(data.settings);
  return {
    allowed: false,
    reason: `Calendar export is disabled until every period has a confirmed clock time. ${missing.length} period(s) still show only الفترة N: ${missing.join(", ")}.`,
    missingPeriods: missing,
  };
}

function escape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  return parts.join("\r\n");
}

/** Stable per-assignment UID tied to the version being exported. */
export function eventUid(versionId: string, assignment: Assignment): string {
  return `${versionId}-${assignment.id}@uqu-schedule-assistant.local`;
}

function localStamp(date: string, clock: string): string {
  return `${date}T${clock.replace(":", "")}00`;
}

/** The first date on or after the anchor that falls on the given weekday. */
function firstOccurrence(anchor: Date, day: string): string {
  const target = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(day);
  const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export type IcsOptions = {
  versionId: string;
  /** Term start; weekly events recur from here. */
  anchorDate?: Date;
  weeks?: number;
  locale?: "ar" | "en";
};

export function buildIcs(data: AppData, assignments: Assignment[], options: IcsOptions): string {
  const gate = icsGate(data);
  if (!gate.allowed) throw new Error(gate.reason);
  const anchor = options.anchorDate ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const weeks = options.weeks ?? 14;
  const locale = options.locale ?? "ar";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UQU Schedule Assistant//1448//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${TIMEZONE}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "TZNAME:+03",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const assignment of assignments) {
    const range = assignment.periods?.length ? periodsToRange(data.settings, assignment.periods) : { start: assignment.start, end: assignment.end };
    if (!range) continue;
    const course = data.courses.find((c) => c.code === assignment.courseCode);
    const colleges = collegesForAssignment(data, assignment).map((id) => collegeName(data.colleges, id, locale)).join(", ");
    const place = isRemote(assignment) ? (locale === "ar" ? REMOTE_LABEL_AR : "Remote") : (assignment.roomId ?? "");
    const date = firstOccurrence(anchor, assignment.day);
    const summary = `${assignment.courseCode} ${assignment.activity ?? ""} · ${assignment.sectionId}`.trim();
    const description = [
      course ? (locale === "ar" ? course.nameAr : course.nameEn) : "",
      assignment.activity ?? "",
      `${locale === "ar" ? "الشعبة" : "Section"}: ${assignment.sectionId}`,
      `${locale === "ar" ? "الكلية" : "College"}: ${colleges || "—"}`,
      `${locale === "ar" ? "المكان" : "Location"}: ${place}`,
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${eventUid(options.versionId, assignment)}`,
      // A fixed stamp keeps regenerated files byte-identical for one version.
      `DTSTAMP:${date}T000000Z`,
      `DTSTART;TZID=${TIMEZONE}:${localStamp(date, range.start)}`,
      `DTEND;TZID=${TIMEZONE}:${localStamp(date, range.end)}`,
      `RRULE:FREQ=WEEKLY;COUNT=${weeks};BYDAY=${DAY_TO_ICS[assignment.day] ?? "SU"}`,
      fold(`SUMMARY:${escape(summary)}`),
      fold(`DESCRIPTION:${escape(description)}`),
      fold(`LOCATION:${escape(place)}`),
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
