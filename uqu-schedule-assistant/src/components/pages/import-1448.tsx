"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Save, Upload } from "lucide-react";
import { useApp } from "../app-provider";
import { Badge, Button, Card, Empty, ErrorSummary, Loading, PageTitle, Stat, type FormError } from "../ui-kit";
import { gridFromBuffer, type WorkbookGrid } from "@/lib/uqu/workbook";
import { detectSheetRole, type SheetRole } from "@/lib/uqu/normalize";
import { parseScheduleSheet, type ScheduleParseResult } from "@/lib/uqu/parse-schedule";
import { parseFacultySheet, type FacultyParseResult } from "@/lib/uqu/parse-faculty";
import { parseRoomWorkbook, type RoomParseResult } from "@/lib/uqu/parse-rooms";
import { compareSchedules, previewCounts, resolveComparison, type ComparisonResult, type MergeStrategy } from "@/lib/uqu/compare";
import { buildAliases, candidatesFor, unresolvedAliases } from "@/lib/uqu/aliases";
import { inferPatterns, type PatternObservation } from "@/lib/uqu/patterns";
import { buildFromImport, importPreview } from "@/lib/uqu/build";
import { trackDepartmentPairs } from "@/lib/colleges";
import type { ColorMeaning, CollegeMapping, CoursePattern, FacultyAlias, RoomColorProfile } from "@/lib/types";
import { UNCLASSIFIED_COLLEGE_ID } from "@/lib/types";

const STEPS = [
  "upload",
  "sheets",
  "compare",
  "aliases",
  "periods",
  "patterns",
  "colors",
  "capacities",
  "colleges",
  "quality",
  "commit",
] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  upload: "1. Upload workbooks",
  sheets: "2. Detect & preview sheets",
  compare: "3. Compare 481 sheets",
  aliases: "4. Resolve faculty names",
  periods: "5. Resolve invalid periods",
  patterns: "6. Confirm course patterns",
  colors: "7. Map room colours",
  capacities: "8. Enter missing capacities",
  colleges: "9. Map colleges",
  quality: "10. Data quality check",
  commit: "11. Preview & commit",
};

const COLOR_MEANINGS: ColorMeaning[] = ["occupied", "unavailable", "available", "informational", "ignore", "unmapped"];

type Parsed = {
  workbookName: string;
  sheets: { name: string; trimmed: string; role: SheetRole; rows: number }[];
  faculty: FacultyParseResult | null;
  original: ScheduleParseResult | null;
  reviewed: ScheduleParseResult | null;
  rooms: RoomParseResult | null;
};

export function Import1448() {
  const { data, setDataWithSnapshot, setToast } = useApp();
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<Parsed[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [strategy, setStrategy] = useState<MergeStrategy>("merge");
  const [aliases, setAliases] = useState<FacultyAlias[]>([]);
  const [patterns, setPatterns] = useState<PatternObservation[]>([]);
  const [colorMap, setColorMap] = useState<Record<string, ColorMeaning>>({});
  const [capacities, setCapacities] = useState<Record<string, string>>({});
  const [mappings, setMappings] = useState<CollegeMapping[]>([]);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [validOnly, setValidOnly] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const roster = useMemo(() => parsed.find((p) => p.faculty)?.faculty?.rows ?? [], [parsed]);
  const original = parsed.find((p) => p.original)?.original ?? null;
  const reviewed = parsed.find((p) => p.reviewed)?.reviewed ?? null;
  const roomResult = parsed.find((p) => p.rooms)?.rooms ?? null;

  const readFiles = async (files: FileList) => {
    const next: Parsed[] = [];
    for (const file of Array.from(files)) {
      let wb: WorkbookGrid;
      try {
        wb = gridFromBuffer(file.name, await file.arrayBuffer());
      } catch {
        setToast(`Could not read ${file.name}`);
        continue;
      }
      const sheets = wb.sheetNames.map((name) => {
        const grid = wb.sheet(name);
        return { name, trimmed: grid?.trimmedName ?? name, role: detectSheetRole(name).role, rows: grid?.rows ?? 0 };
      });
      const facultySheet = sheets.find((s) => s.role === "faculty");
      const originalSheet = sheets.find((s) => s.role === "schedule-original");
      const reviewedSheet = sheets.find((s) => s.role === "schedule-reviewed");
      const hasRooms = sheets.some((s) => s.role === "rooms-main" || s.role === "rooms-q2");
      next.push({
        workbookName: file.name,
        sheets,
        faculty: facultySheet ? parseFacultySheet(file.name, wb.sheet(facultySheet.name)!) : null,
        original: originalSheet ? parseScheduleSheet(file.name, wb.sheet(originalSheet.name)!) : null,
        reviewed: reviewedSheet ? parseScheduleSheet(file.name, wb.sheet(reviewedSheet.name)!) : null,
        rooms: hasRooms ? parseRoomWorkbook(file.name, wb) : null,
      });
    }
    setParsed(next);

    const orig = next.find((p) => p.original)?.original ?? null;
    const rev = next.find((p) => p.reviewed)?.reviewed ?? null;
    if (orig && rev) setComparison(compareSchedules(orig, rev));

    const rosterRows = next.find((p) => p.faculty)?.faculty?.rows ?? [];
    const rows = [...(orig?.rows ?? []), ...(rev?.rows ?? [])];
    setAliases(buildAliases(rows.filter((r) => r.facultyDisplay).map((r) => ({ display: r.facultyDisplay, ref: r.ref })), rosterRows));
    setPatterns(inferPatterns(rows));

    const rooms = next.find((p) => p.rooms)?.rooms ?? null;
    if (rooms) setColorMap(Object.fromEntries(rooms.colors.map((c) => [c.color, "unmapped" as ColorMeaning])));

    setStep("sheets");
    setToast(`Parsed ${next.length} workbook(s). Every source row is kept for review.`);
  };

  const resolvedRows = useMemo(() => {
    if (comparison) return resolveComparison(comparison, strategy);
    return original?.rows ?? reviewed?.rows ?? [];
  }, [comparison, strategy, original, reviewed]);

  const invalidMeetings = resolvedRows.flatMap((r) => r.meetings.filter((m) => m.error).map((m) => ({ row: r, meeting: m })));
  const normalizedMeetings = resolvedRows.flatMap((r) => r.meetings.filter((m) => m.normalizations.length).map((m) => ({ row: r, meeting: m })));
  const pairs = useMemo(() => {
    const seen = new Map<string, { track: string; department: string; count: number }>();
    for (const row of resolvedRows) {
      const key = `${row.track}|${row.department}`;
      const entry = seen.get(key) ?? { track: row.track, department: row.department, count: 0 };
      entry.count += 1;
      seen.set(key, entry);
    }
    return [...seen.values()].sort((a, b) => b.count - a.count);
  }, [resolvedRows]);

  const buildResult = useMemo(() => {
    if (!data || !parsed.length) return null;
    const profile: RoomColorProfile | null = roomResult ? { id: "import", name: "Import profile", map: colorMap, createdAt: new Date().toISOString() } : null;
    const roomsWithCapacity = (roomResult?.rooms ?? []).map((room) => {
      const entered = capacities[room.code];
      if (entered && Number.isFinite(Number(entered))) return { ...room, capacity: Number(entered), capacityUnknown: false };
      return room;
    });
    return buildFromImport({
      rows: validOnly ? resolvedRows.filter((r) => !r.meetings.some((m) => m.error)) : resolvedRows,
      roster,
      aliases,
      rooms: roomsWithCapacity,
      roomEntries: roomResult?.entries.map((e) => ({ ...e })) ?? [],
      colorProfile: profile,
      mappings,
      colleges: data.colleges,
      patterns: patterns.map(({ durations, conflicting, ...rest }) => {
        void durations;
        void conflicting;
        return rest as CoursePattern;
      }),
      settings: data.settings,
    });
  }, [data, parsed, resolvedRows, roster, aliases, roomResult, colorMap, capacities, mappings, patterns, validOnly]);

  if (!data) return <Loading />;

  const unresolved = unresolvedAliases(aliases);
  const unmappedColors = roomResult ? roomResult.colors.filter((c) => (colorMap[c.color] ?? "unmapped") === "unmapped") : [];
  const unmappedPairs = pairs.filter((p) => !mappings.some((m) => m.track === p.track && m.department === p.department && m.confirmed));

  const blockers: FormError[] = [];
  if (invalidMeetings.length && !validOnly) {
    blockers.push({ field: "step-periods", message: `${invalidMeetings.length} period value(s) are outside the observed 1–12 range and must be corrected or explicitly excluded.` });
  }
  if (unresolved.length) blockers.push({ field: "step-aliases", message: `${unresolved.length} faculty name(s) are not confirmed against a roster record.` });
  if (unmappedColors.length) blockers.push({ field: "step-colors", message: `${unmappedColors.length} room colour(s) have no assigned meaning.` });
  if (unmappedPairs.length) blockers.push({ field: "step-colleges", message: `${unmappedPairs.length} track/department pair(s) are not mapped to a college.` });

  const commit = async () => {
    if (!buildResult) return;
    if (blockers.length) {
      setErrors(blockers);
      return;
    }
    setErrors([]);
    const next = {
      ...data,
      faculty: buildResult.faculty.length ? buildResult.faculty : data.faculty,
      courses: [...data.courses.filter((c) => !buildResult.courses.some((n) => n.code === c.code)), ...buildResult.courses],
      sections: [...data.sections.filter((s) => !buildResult.sections.some((n) => n.id === s.id)), ...buildResult.sections],
      rooms: buildResult.rooms.length ? buildResult.rooms : data.rooms,
      assignments: buildResult.assignments,
      sourceRows: buildResult.sourceRows,
      facultyAliases: aliases,
      coursePatterns: patterns.map(({ durations, conflicting, ...rest }) => {
        void durations;
        void conflicting;
        return { ...rest, confirmed: true } as CoursePattern;
      }),
      collegeMappings: mappings,
      roomColorProfiles: [{ id: crypto.randomUUID(), name: `Imported ${new Date().toISOString().slice(0, 10)}`, map: colorMap, createdAt: new Date().toISOString() }, ...data.roomColorProfiles],
      scheduleState: "draft" as const,
      approvedVersionId: null,
    };
    await setDataWithSnapshot("Before committing the 1448 import", next);
    setToast(
      buildResult.blocked.length
        ? `Imported ${buildResult.assignments.length} meeting(s). ${buildResult.blocked.length} source row(s) were blocked and are listed in the Data Quality Center — none were silently skipped.`
        : `Imported ${buildResult.assignments.length} meeting(s) from ${buildResult.sourceRows.length} source row(s).`,
    );
  };

  return (
    <>
      <PageTitle title="UQU 1448 importer" subtitle="Reads the department's own workbook formats: Arabic headers, repeated header rows, Excel date periods, activity rules, and colour-coded room grids." />
      <div className="notice">
        <AlertTriangle />
        <span>Workbooks are parsed entirely in this browser. Nothing is uploaded, and imported records stay in local storage on this device.</span>
      </div>
      <ErrorSummary errors={errors} />

      <div className="wizard-steps">
        {STEPS.map((s) => (
          <button key={s} id={`step-${s}`} className={step === s ? "active" : ""} onClick={() => setStep(s)} disabled={s !== "upload" && !parsed.length}>
            {STEP_LABELS[s]}
          </button>
        ))}
      </div>

      {step === "upload" && (
        <Card>
          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) void readFiles(e.dataTransfer.files);
            }}
          >
            <Upload />
            <h2>Drop both workbooks here</h2>
            <p>The student schedule workbook and the room distribution workbook. Both can be selected at once.</p>
            <Button onClick={() => input.current?.click()}>Choose files</Button>
            <input
              ref={input}
              hidden
              multiple
              type="file"
              accept=".xlsx,.xlsm,.xls"
              onChange={(e) => {
                if (e.target.files?.length) void readFiles(e.target.files);
              }}
            />
          </div>
        </Card>
      )}

      {step === "sheets" && (
        <div className="stack">
          {parsed.map((wb) => (
            <Card key={wb.workbookName} className="table-wrap">
              <h2>{wb.workbookName}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Sheet name (raw)</th>
                    <th>After trimming</th>
                    <th>Detected role</th>
                    <th>Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {wb.sheets.map((s) => (
                    <tr key={s.name}>
                      <td className="source-ref">{JSON.stringify(s.name)}</td>
                      <td>{s.trimmed}</td>
                      <td>{s.role === "unknown" ? <Badge tone="warning">unknown</Badge> : <Badge tone="success">{s.role}</Badge>}</td>
                      <td>{s.rows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {wb.faculty && (
                <div className="stat-row">
                  <Stat label="Roster rows" value={wb.faculty.rows.length} />
                  <Stat label="Internal" value={wb.faculty.internal} />
                  <Stat label="External / cooperating" value={wb.faculty.external} />
                  <Stat label="Subtotal rows skipped" value={wb.faculty.subtotalRows.length} />
                  <Stat label="Duplicate display names" value={wb.faculty.duplicateNames.length} tone={wb.faculty.duplicateNames.length ? "warning" : undefined} />
                </div>
              )}
              {[wb.original, wb.reviewed].filter(Boolean).map((sheet) => (
                <div className="stat-row" key={sheet!.sheet}>
                  <Stat label={`${sheet!.sheet} rows`} value={sheet!.rows.length} />
                  <Stat label="Header rows" value={sheet!.headerRows.length} />
                  <Stat label="Blank separators" value={sheet!.blankRows} />
                  <Stat label="Anomalies kept for review" value={sheet!.anomalies.length} tone={sheet!.anomalies.length ? "warning" : undefined} />
                  <Stat label="Invalid periods" value={sheet!.invalidPeriods.length} tone={sheet!.invalidPeriods.length ? "danger" : "success"} />
                </div>
              ))}
              {wb.rooms && (
                <div className="stat-row">
                  <Stat label="Rooms" value={wb.rooms.rooms.length} />
                  <Stat label="With capacity" value={wb.rooms.rooms.filter((r) => r.capacity !== null).length} />
                  <Stat label="Capacity unknown" value={wb.rooms.rooms.filter((r) => r.capacityUnknown).length} tone="warning" />
                  <Stat label="Distinct fill colours" value={wb.rooms.colors.length} />
                  <Stat label="Text reservations" value={wb.rooms.textReservations.length} />
                </div>
              )}
              {[wb.original, wb.reviewed].filter(Boolean).flatMap((sheet) => sheet!.anomalies).length > 0 && (
                <>
                  <h2>Rows kept for review</h2>
                  <ul className="reason-list">
                    {[wb.original, wb.reviewed]
                      .filter(Boolean)
                      .flatMap((sheet) => sheet!.anomalies)
                      .map((a) => (
                        <li key={`${a.ref.sheet}-${a.ref.row}`}>
                          <span className="source-ref">
                            {a.ref.sheet}!row {a.ref.row}
                          </span>{" "}
                          — {a.reason} Raw: {a.raw.filter(Boolean).join(" | ")}
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      {step === "compare" && (
        <Card>
          <h2>481 compared with 481 مراجعة</h2>
          {!comparison ? (
            <Empty text="Both scheduling sheets are needed for a comparison." />
          ) : (
            <>
              <div className="stat-row">
                <Stat label="Rows in 481" value={comparison.summary.originalRows} />
                <Stat label="Rows in 481 مراجعة" value={comparison.summary.reviewedRows} />
                <Stat label="Composite sections (481)" value={comparison.summary.originalSections} />
                <Stat label="Composite sections (مراجعة)" value={comparison.summary.reviewedSections} />
                <Stat label="Matching assignments" value={comparison.summary.matched} />
                <Stat label="Only in 481" value={comparison.summary.onlyOriginal} tone="warning" />
                <Stat label="Only in 481 مراجعة" value={comparison.summary.onlyReviewed} tone="warning" />
                <Stat label="Changed faculty" value={comparison.summary.facultyChanged} />
                <Stat label="Changed time" value={comparison.summary.timeChanged} />
                <Stat label="New room codes" value={comparison.summary.roomCodesAdded} />
                <Stat label="Repeated composite keys" value={comparison.summary.duplicateKeys.length} tone={comparison.summary.duplicateKeys.length ? "warning" : undefined} />
              </div>
              <p className="footnote">Neither sheet is treated as authoritative. Choose how to resolve the differences, then review each record below.</p>
              <div className="filter-bar">
                <label>
                  Resolution
                  <select value={strategy} onChange={(e) => setStrategy(e.target.value as MergeStrategy)}>
                    <option value="original">Use 481</option>
                    <option value="reviewed">Use 481 مراجعة</option>
                    <option value="merge">Merge, with reviewed records as overrides</option>
                  </select>
                </label>
              </div>
              <div className="stat-row">
                {Object.entries(previewCounts(comparison, strategy)).map(([key, value]) => (
                  <Stat key={key} label={key} value={value} />
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Composite key</th>
                      <th>Status</th>
                      <th>Difference</th>
                      <th>Keep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.records
                      .filter((r) => r.status !== "matched" || r.facultyChanged || r.timeChanged || r.roomCodeAdded)
                      .slice(0, 200)
                      .map((record, i) => (
                        <tr key={`${record.key}-${i}`}>
                          <td className="source-ref">{record.key}</td>
                          <td>
                            <Badge tone={record.status === "matched" ? "success" : "warning"}>{record.status}</Badge>
                            {record.duplicate && <Badge tone="warning">repeated key</Badge>}
                          </td>
                          <td>
                            {record.facultyChanged && (
                              <div>
                                Faculty: {record.original?.facultyDisplay} → {record.reviewed?.facultyDisplay}
                                {record.facultySpellingOnly && <Badge>spelling only</Badge>}
                              </div>
                            )}
                            {record.timeChanged && (
                              <div>
                                Time: {record.original?.meetings.map((m) => `${m.day} ${m.display}`).join("; ")} → {record.reviewed?.meetings.map((m) => `${m.day} ${m.display}`).join("; ")}
                              </div>
                            )}
                            {record.roomCodeAdded && <div>Room code entered: {record.reviewed?.extras.map((e) => e.value).join(", ")}</div>}
                            {record.status !== "matched" && <div>Present in only one sheet.</div>}
                          </td>
                          <td>
                            <select
                              aria-label={`Decision for ${record.key}`}
                              value={record.decision}
                              onChange={(e) =>
                                setComparison({
                                  ...comparison,
                                  records: comparison.records.map((r, index) => (index === comparison.records.indexOf(record) ? { ...r, decision: e.target.value as typeof r.decision } : r)),
                                })
                              }
                            >
                              <option value="undecided">Follow the resolution above</option>
                              <option value="use-original">Keep the 481 record</option>
                              <option value="use-reviewed">Keep the reviewed record</option>
                              <option value="keep-both">Import both</option>
                              <option value="drop">Do not import</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {step === "aliases" && (
        <Card className="table-wrap">
          <div className="card-head">
            <div>
              <h2>Faculty name resolution</h2>
              <p>Names are never merged automatically. Confirm each uncertain or repeated match.</p>
            </div>
            <Badge tone={unresolved.length ? "warning" : "success"}>{unresolved.length} unresolved</Badge>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name in the schedule</th>
                <th>Occurrences</th>
                <th>Status</th>
                <th>Roster record</th>
              </tr>
            </thead>
            <tbody>
              {aliases.map((alias) => {
                const options = candidatesFor(alias.display, roster, 0.3);
                return (
                  <tr key={alias.id}>
                    <td>{alias.display}</td>
                    <td>{alias.sourceRefs.length}</td>
                    <td>
                      <Badge tone={alias.status === "resolved" ? "success" : alias.status === "ambiguous" ? "danger" : "warning"}>{alias.status}</Badge>
                    </td>
                    <td>
                      <select
                        aria-label={`Roster record for ${alias.display}`}
                        value={alias.facultyId ?? ""}
                        onChange={(e) =>
                          setAliases(aliases.map((a) => (a.id === alias.id ? { ...a, facultyId: e.target.value || null, status: e.target.value ? "resolved" : "unresolved" } : a)))
                        }
                      >
                        <option value="">Not confirmed</option>
                        {options.map((c) => (
                          <option key={c.facultyId} value={c.facultyId}>
                            {c.name} — {Math.round(c.score * 100)}% ({c.reason})
                          </option>
                        ))}
                        {roster.map((r) => (
                          <option key={`all-${r.id}`} value={r.id}>
                            {r.name} · roster row {r.ref.row}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {step === "periods" && (
        <div className="stack">
          <Card className="table-wrap">
            <div className="card-head">
              <div>
                <h2>Blocking period values</h2>
                <p>Values outside the observed 1–12 range are never repaired automatically.</p>
              </div>
              <Badge tone={invalidMeetings.length ? "danger" : "success"}>{invalidMeetings.length} blocking</Badge>
            </div>
            {invalidMeetings.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Source cell</th>
                    <th>Displayed value</th>
                    <th>Course / activity</th>
                    <th>Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {invalidMeetings.map(({ row, meeting }) => (
                    <tr key={`${meeting.ref.sheet}-${meeting.ref.column}${meeting.ref.row}`}>
                      <td className="source-ref">
                        {meeting.ref.sheet}!{meeting.ref.column}
                        {meeting.ref.row}
                      </td>
                      <td>
                        <b>{meeting.display}</b>
                      </td>
                      <td>
                        {row.courseCode} {row.activity} · {row.sectionNumber}
                      </td>
                      <td>{meeting.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty text="No blocking period values." />
            )}
            <label className="toggle" htmlFor="valid-only">
              <input id="valid-only" type="checkbox" checked={validOnly} onChange={(e) => setValidOnly(e.target.checked)} />
              <span>Import valid rows only, and record every excluded row with its reason</span>
            </label>
          </Card>
          <Card className="table-wrap">
            <h2>Normalizations applied</h2>
            {normalizedMeetings.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Source cell</th>
                    <th>Value</th>
                    <th>Normalization</th>
                    <th>Resulting periods</th>
                  </tr>
                </thead>
                <tbody>
                  {normalizedMeetings.map(({ meeting }) => (
                    <tr key={`${meeting.ref.sheet}-${meeting.ref.column}${meeting.ref.row}`}>
                      <td className="source-ref">
                        {meeting.ref.sheet}!{meeting.ref.column}
                        {meeting.ref.row}
                      </td>
                      <td>{meeting.display}</td>
                      <td>{meeting.normalizations.join("; ")}</td>
                      <td>{meeting.periods.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty text="No normalizations were needed." />
            )}
          </Card>
          <Card className="table-wrap">
            <h2>Rows split across more than one day</h2>
            {resolvedRows.filter((r) => r.meetings.length > 1).length ? (
              <table>
                <thead>
                  <tr>
                    <th>Source row</th>
                    <th>Course</th>
                    <th>Meetings</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedRows
                    .filter((r) => r.meetings.length > 1)
                    .map((r) => (
                      <tr key={r.sourceRowId}>
                        <td className="source-ref">{r.sourceRowId}</td>
                        <td>
                          {r.courseCode} {r.activity} · {r.sectionNumber}
                        </td>
                        <td>{r.meetings.map((m) => `${m.day} ${m.display}`).join(" + ")}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <Empty text="No source row carries meetings on more than one day." />
            )}
          </Card>
        </div>
      )}

      {step === "patterns" && (
        <Card className="table-wrap">
          <div className="card-head">
            <div>
              <h2>Detected course patterns</h2>
              <p>Durations read from the workbook. Confirm or edit before they become templates.</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>Activity</th>
                <th>Periods</th>
                <th>Delivery</th>
                <th>Observations</th>
                <th>Confirm</th>
              </tr>
            </thead>
            <tbody>
              {patterns.map((p, index) => (
                <tr key={`${p.courseCode}-${p.activity}`}>
                  <td>
                    <b>{p.courseCode}</b>
                  </td>
                  <td>{p.activity}</td>
                  <td>
                    <input
                      type="number"
                      aria-label={`Periods for ${p.courseCode} ${p.activity}`}
                      value={p.periods}
                      onChange={(e) => setPatterns(patterns.map((x, i) => (i === index ? { ...x, periods: Number(e.target.value), source: "manual" } : x)))}
                    />
                    {p.conflicting && <small>Also seen as: {p.durations.map((d) => `${d.periods}×${d.count}`).join(", ")}</small>}
                  </td>
                  <td>{p.deliveryMode === "remote" ? <Badge tone="warning">عن بُعد</Badge> : "In person"}</td>
                  <td>{p.observations}</td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Confirm ${p.courseCode} ${p.activity}`}
                      checked={p.confirmed}
                      onChange={(e) => setPatterns(patterns.map((x, i) => (i === index ? { ...x, confirmed: e.target.checked } : x)))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {step === "colors" && (
        <Card>
          <div className="card-head">
            <div>
              <h2>Room colour meanings</h2>
              <p>The workbook has no legend, comments, or conditional formatting rules, so no meaning is guessed. Choose one for each colour.</p>
            </div>
            <Badge tone={unmappedColors.length ? "warning" : "success"}>{unmappedColors.length} unmapped</Badge>
          </div>
          {roomResult ? (
            roomResult.colors.map((color) => (
              <div className="color-row" key={color.color}>
                <span className="swatch" style={{ background: color.color.startsWith("#") ? color.color : "var(--surface-2)" }} aria-hidden="true" />
                <span className="source-ref">{color.color}</span>
                <span>
                  {color.count} cell(s), {color.gridCount} inside a period grid
                </span>
                <span className="source-ref">e.g. {color.samples.slice(0, 3).join(", ")}</span>
                <select
                  aria-label={`Meaning for colour ${color.color}`}
                  value={colorMap[color.color] ?? "unmapped"}
                  onChange={(e) => setColorMap({ ...colorMap, [color.color]: e.target.value as ColorMeaning })}
                >
                  {COLOR_MEANINGS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            ))
          ) : (
            <Empty text="No room workbook was uploaded." />
          )}
          {roomResult && roomResult.textReservations.length > 0 && (
            <>
              <h2>Text reservations</h2>
              <p>Written reservations found under period columns. They are imported as reviewable occupied periods.</p>
              <ul className="reason-list">
                {roomResult.textReservations.map((t) => (
                  <li key={`${t.ref.sheet}-${t.ref.column}${t.ref.row}`}>
                    <span className="source-ref">
                      {t.ref.sheet}!{t.ref.column}
                      {t.ref.row}
                    </span>{" "}
                    — room {t.roomCode}, period {t.period}: “{t.text}”
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {step === "capacities" && (
        <Card className="table-wrap">
          <div className="card-head">
            <div>
              <h2>Missing room capacities</h2>
              <p>Rooms stay “capacity unknown” until a number is supplied. They are not used under a capacity constraint before then.</p>
            </div>
          </div>
          {roomResult ? (
            <table>
              <thead>
                <tr>
                  <th>Room code</th>
                  <th>Display name</th>
                  <th>Group</th>
                  <th>Capacity in workbook</th>
                  <th>Capacity to use</th>
                </tr>
              </thead>
              <tbody>
                {roomResult.rooms.map((room) => (
                  <tr key={room.code}>
                    <td>
                      <b>{room.code}</b>
                    </td>
                    <td>{room.displayName}</td>
                    <td>{room.group}</td>
                    <td>{room.capacity === null ? <Badge tone="warning">unknown</Badge> : room.capacity}</td>
                    <td>
                      <input
                        type="number"
                        aria-label={`Capacity for ${room.code}`}
                        value={capacities[room.code] ?? (room.capacity ?? "")}
                        placeholder="leave blank to keep unknown"
                        onChange={(e) => setCapacities({ ...capacities, [room.code]: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty text="No room workbook was uploaded." />
          )}
        </Card>
      )}

      {step === "colleges" && (
        <Card>
          <div className="card-head">
            <div>
              <h2>Map track and department to a college</h2>
              <p>The workbooks carry المسار and القسم but no college field. Ambiguous pairs are never guessed.</p>
            </div>
            <Badge tone={unmappedPairs.length ? "warning" : "success"}>{unmappedPairs.length} unmapped</Badge>
          </div>
          {pairs.map((pair) => {
            const existing = mappings.find((m) => m.track === pair.track && m.department === pair.department);
            return (
              <div className="mapping-row" key={`${pair.track}|${pair.department}`}>
                <span>{pair.track || "—"}</span>
                <span>{pair.department || "—"}</span>
                <select
                  multiple
                  aria-label={`Colleges for ${pair.track} / ${pair.department}`}
                  value={existing?.collegeIds ?? []}
                  onChange={(e) => {
                    const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
                    const next: CollegeMapping = { track: pair.track, department: pair.department, collegeIds: ids, confirmed: ids.length > 0 };
                    setMappings([...mappings.filter((m) => !(m.track === pair.track && m.department === pair.department)), next]);
                  }}
                >
                  {data.colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameAr} — {c.nameEn}
                    </option>
                  ))}
                </select>
                <span>
                  {pair.count} rows {existing?.confirmed ? <Badge tone="success">mapped</Badge> : <Badge tone="warning">unmapped</Badge>}
                </span>
              </div>
            );
          })}
          <p className="footnote">
            Select more than one college for a shared section. Anything genuinely unclassifiable can be filed under غير مصنف, which is offered as a college option.
          </p>
          <NewCollegeForm />
        </Card>
      )}

      {step === "quality" && (
        <Card>
          <h2>Pre-commit checks</h2>
          <div className="stat-row">
            <Stat label="Blocking period values" value={invalidMeetings.length} tone={invalidMeetings.length && !validOnly ? "danger" : "success"} />
            <Stat label="Unresolved faculty names" value={unresolved.length} tone={unresolved.length ? "danger" : "success"} />
            <Stat label="Unmapped room colours" value={unmappedColors.length} tone={unmappedColors.length ? "danger" : "success"} />
            <Stat label="Unmapped track/department pairs" value={unmappedPairs.length} tone={unmappedPairs.length ? "danger" : "success"} />
            <Stat label="Rooms without capacity" value={(roomResult?.rooms ?? []).filter((r) => r.capacity === null && !capacities[r.code]).length} tone="warning" />
            <Stat label="Unconfirmed course patterns" value={patterns.filter((p) => !p.confirmed).length} tone="warning" />
          </div>
          {blockers.length ? (
            <ul className="reason-list">
              {blockers.map((b) => (
                <li key={b.field}>{b.message}</li>
              ))}
            </ul>
          ) : (
            <p>
              <CheckCircle2 aria-hidden="true" /> Everything needed for a clean import has been resolved.
            </p>
          )}
        </Card>
      )}

      {step === "commit" && (
        <Card>
          <h2>Final preview</h2>
          {buildResult ? (
            <>
              <div className="stat-row">
                {Object.entries(importPreview(buildResult)).map(([key, value]) => (
                  <Stat key={key} label={key} value={value} tone={key === "blocked" && value ? "danger" : undefined} />
                ))}
              </div>
              {buildResult.blocked.length > 0 && (
                <>
                  <h2>Rows that will not be imported</h2>
                  <ul className="reason-list">
                    {buildResult.blocked.map((b) => (
                      <li key={b.row.sourceRowId}>
                        <span className="source-ref">{b.row.sourceRowId}</span> — {b.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="toolbar">
                <Button onClick={() => void commit()} disabled={blockers.length > 0}>
                  <Save />
                  Commit import
                </Button>
                <Link className="button ghost" href="/versions">
                  Rollback snapshots
                </Link>
              </div>
              <p className="footnote">
                A restorable snapshot is created before the import is written, and the full rollback list lives on the Versions page.
              </p>
            </>
          ) : (
            <Empty text="Upload the workbooks first." />
          )}
        </Card>
      )}
    </>
  );
}

function NewCollegeForm() {
  const { data, setData, setToast } = useApp();
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  if (!data) return null;
  return (
    <div className="field-row">
      <label htmlFor="new-college-ar">
        New college (Arabic)
        <input id="new-college-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
      </label>
      <label htmlFor="new-college-en">
        New college (English)
        <input id="new-college-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </label>
      <Button
        onClick={() => {
          if (!nameAr.trim()) {
            setToast("Enter the Arabic college name");
            return;
          }
          setData({ ...data, colleges: [...data.colleges, { id: `COL-${crypto.randomUUID().slice(0, 8)}`, nameAr: nameAr.trim(), nameEn: nameEn.trim() || nameAr.trim() }] });
          setNameAr("");
          setNameEn("");
          setToast("College added");
        }}
      >
        Add college
      </Button>
    </div>
  );
}

export { UNCLASSIFIED_COLLEGE_ID, FileSpreadsheet, trackDepartmentPairs };
