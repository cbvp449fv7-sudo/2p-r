"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, Download, FileSpreadsheet, Info, Lock, Package, Play, RefreshCw, Send, Unlock } from "lucide-react";
import { useApp } from "../app-provider";
import { Badge, Button, Card, Dialog, Empty, ErrorSummary, Loading, PageTitle, Stat, downloadBlob, type FormError } from "../ui-kit";
import { filterIssues, qualityReportText, runQualityChecks, QUALITY_CATEGORIES } from "@/lib/quality";
import { buildQueue, batchRepair, suggestRepairs, type QueueItem, type Repair } from "@/lib/unscheduled";
import { generate, type UnscheduledReason } from "@/lib/engine";
import { previewImpact } from "@/lib/impact";
import { ImpactDialog } from "./core";
import { collegeSummaries, trackDepartmentPairs, unmappedAssignments, findMapping } from "@/lib/colleges";
import { buildAllColleges, buildCollegeWorkbook, bulkExportGate, exportableColleges } from "@/lib/export-college";
import { distributionWarnings, markDelivered, recordPackage } from "@/lib/distribution";
import { approve, distribute, reopen, sendForReview, STATE_LABELS, isLocked } from "@/lib/workflow";
import { buildIcs, icsGate } from "@/lib/ics";
import { applyBulk, type BulkAction } from "@/lib/bulk";
import type { CollegeMapping, QualitySeverity } from "@/lib/types";
import { UNCLASSIFIED_COLLEGE_ID } from "@/lib/types";

/* -------------------------------------------------- Data Quality Center */

export function QualityCenter() {
  const { data, locale, setToast } = useApp();
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [sheet, setSheet] = useState("");
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [runToken, setRunToken] = useState(0);

  // Re-running validation bumps this token, which re-derives the report.
  const report = useMemo(() => {
    void runToken;
    return data ? runQualityChecks(data) : null;
  }, [data, runToken]);

  if (!data || !report) return <Loading />;

  const sheets = [...new Set(report.issues.map((i) => i.ref?.sheet).filter((s): s is string => Boolean(s)))];
  const visible = filterIssues(report.issues, { category, severity, sheet, text });

  return (
    <>
      <PageTitle
        title="Data Quality Center"
        subtitle="Runs before generation, approval, and export. Every finding carries its source cell and a link to the record."
        actions={
          <>
            <Button className="ghost" onClick={() => setRunToken((n) => n + 1)}>
              <RefreshCw /> Re-run validation
            </Button>
            <Button
              className="secondary"
              onClick={() => {
                downloadBlob(`UQU-validation-report-${new Date().toISOString().slice(0, 10)}.txt`, qualityReportText(report), "text/plain;charset=utf-8");
                setToast("Validation report exported");
              }}
            >
              <Download /> Export report
            </Button>
          </>
        }
      />
      <div className="stat-row">
        <Stat label="Blocking errors" value={report.counts.error} tone={report.counts.error ? "danger" : "success"} />
        <Stat label="Warnings" value={report.counts.warning} tone={report.counts.warning ? "warning" : "success"} />
        <Stat label="Information" value={report.counts.info} />
        <Stat label="Last run" value={new Date(report.ranAt).toLocaleTimeString()} />
      </div>
      {report.blocking && (
        <div className="notice">
          <AlertTriangle />
          <span>Approval and bulk export stay blocked while there are blocking errors.</span>
        </div>
      )}

      <Card>
        <div className="filter-bar">
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {QUALITY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c} ({report.byCategory[c] ?? 0})
                </option>
              ))}
            </select>
          </label>
          <label>
            Severity
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">All severities</option>
              {(["error", "warning", "info"] as QualitySeverity[]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source sheet
            <select value={sheet} onChange={(e) => setSheet(e.target.value)}>
              <option value="">All sheets</option>
              {sheets.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Faculty, college, record…" />
          </label>
          <Button className="ghost" onClick={() => setSelected(visible.map((i) => i.id))}>
            Select all shown ({visible.length})
          </Button>
          <Button className="ghost" onClick={() => setSelected([])}>
            Clear selection
          </Button>
        </div>
        {selected.length > 0 && (
          <p className="footnote">
            {selected.length} issue(s) selected. Bulk resolution is offered only where it is safe: open each record from the table to fix anything that changes the schedule.
          </p>
        )}
      </Card>

      <Card className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="checkbox-cell">
                <span className="sr-only">Select</span>
              </th>
              <th>Severity</th>
              <th>Category</th>
              <th>Finding</th>
              <th>Record</th>
              <th>Source cell</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((issue) => (
              <tr key={issue.id}>
                <td className="checkbox-cell">
                  <input
                    type="checkbox"
                    aria-label={`Select ${issue.id}`}
                    checked={selected.includes(issue.id)}
                    onChange={(e) => setSelected(e.target.checked ? [...selected, issue.id] : selected.filter((x) => x !== issue.id))}
                  />
                </td>
                <td>
                  <span className={`severity ${issue.severity}`}>
                    {issue.severity === "error" ? <AlertTriangle aria-hidden="true" /> : issue.severity === "warning" ? <AlertTriangle aria-hidden="true" /> : <Info aria-hidden="true" />}
                    {issue.severity}
                  </span>
                </td>
                <td>{issue.category}</td>
                <td>{locale === "ar" ? issue.messageAr : issue.messageEn}</td>
                <td>
                  {issue.link ? (
                    <a href={issue.link}>
                      {issue.entity.kind}: {issue.entity.id}
                    </a>
                  ) : (
                    `${issue.entity.kind}: ${issue.entity.id}`
                  )}
                </td>
                <td className="source-ref">
                  {issue.ref ? `${issue.ref.sheet}!${issue.ref.column}${issue.ref.row}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <Empty text="No findings match these filters." />}
      </Card>
    </>
  );
}

/* --------------------------------------------- Unscheduled assignments */

export function UnscheduledQueue() {
  const { data, setData, setDataWithSnapshot, setToast } = useApp();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<{ label: string; next: Parameters<typeof previewImpact>[1] } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [shown, setShown] = useState(25);

  useEffect(() => {
    if (!data) return;
    // The generator hands the queue over through session storage. Read it
    // after paint so the effect does not trigger a cascading render.
    queueMicrotask(() => {
      const stored = sessionStorage.getItem("uqu-unscheduled");
      const reasons: UnscheduledReason[] = stored ? JSON.parse(stored) : [];
      setItems(buildQueue(data, reasons));
    });
  }, [data]);

  if (!data) return <Loading />;

  const rerun = () => {
    const result = generate(data, "balanced");
    sessionStorage.setItem("uqu-unscheduled", JSON.stringify(result.unscheduled));
    setItems(buildQueue(data, result.unscheduled));
    setToast(result.ok ? "The generator placed every meeting; the queue is empty." : `${result.unscheduled.length} meeting(s) could not be placed.`);
  };

  const applyOne = (item: QueueItem, repair: Repair) => {
    const next = repair.apply(data);
    if (!next) {
      setToast(`${repair.summary} needs a manual edit and was not applied automatically.`);
      return;
    }
    setPending({ label: repair.summary, next });
  };

  const confirmPending = async () => {
    if (!pending) return;
    await setDataWithSnapshot(`Before applying repair: ${pending.label}`, pending.next);
    setToast(`Applied: ${pending.label}`);
    setPending(null);
  };

  const batch = async () => {
    const chosen = items
      .filter((i) => selected.includes(i.id))
      .map((i) => ({ itemId: i.id, repair: (i.repairsComputed ? i.repairs : suggestRepairs(data, i.reason))[0] }))
      .filter((x) => x.repair);
    if (!chosen.length) {
      setToast("Select items that have at least one suggestion.");
      return;
    }
    const result = batchRepair(data, chosen);
    await setDataWithSnapshot(`Before batch repair of ${chosen.length} item(s)`, result.data);
    setToast(
      result.failed.length
        ? `${result.applied.length} repaired, ${result.failed.length} need a manual edit. This is a partial result, not a full success.`
        : `${result.applied.length} item(s) repaired.`,
    );
    setSelected([]);
  };

  return (
    <>
      <PageTitle
        title="Unscheduled assignments"
        subtitle="Every meeting the generator could not place, with the constraints that blocked it and ranked repairs."
        actions={
          <>
            <Button onClick={rerun}>
              <Play /> Re-run the generator
            </Button>
            <Button className="secondary" onClick={() => void batch()} disabled={!selected.length}>
              Batch-repair selected ({selected.length})
            </Button>
          </>
        }
      />
      <div className="stat-row">
        <Stat label="Unscheduled meetings" value={items.length} tone={items.length ? "warning" : "success"} />
        <Stat label="Solvable by moving to Thursday" value={items.filter((i) => i.reason.thursdayWouldHelp).length} />
        <Stat label="Needing an authorized override" value={items.filter((i) => i.reason.overrideRequired).length} />
      </div>

      {!items.length && <Empty text="Nothing is queued. Run the generator to populate this list." />}

      {items.slice(0, shown).map((item) => (
        <div className="queue-item" key={item.id}>
          <div className="card-head">
            <div>
              <h3>
                {item.reason.need.courseCode} · {item.reason.need.activity || "activity not specified"} · section {item.reason.need.sectionId}
              </h3>
              <p>
                Faculty {item.reason.need.facultyId || "unassigned"} · required duration {item.reason.need.requiredPeriods || "?"} period(s) ·{" "}
                {data.sections.find((s) => s.id === item.reason.need.sectionId)?.collegeIds?.join(", ") || "no college"}
              </p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                aria-label={`Select ${item.id}`}
                checked={selected.includes(item.id)}
                onChange={(e) => setSelected(e.target.checked ? [...selected, item.id] : selected.filter((x) => x !== item.id))}
              />
              <span>Select</span>
            </label>
          </div>

          <h4>Hard constraints preventing placement</h4>
          <ul className="reason-list">
            {item.reason.hardConstraints.map((c) => (
              <li key={c}>{c}</li>
            ))}
            {!item.reason.hardConstraints.length && <li>No hard constraint was recorded; the search ran out of time.</li>}
          </ul>

          <div className="stat-row">
            <Stat label="Days considered" value={item.reason.consideredDays.join(", ") || "none"} />
            <Stat label="Rooms rejected" value={item.reason.rejectedRooms.length} />
            <Stat label="Thursday would solve it" value={item.reason.thursdayWouldHelp ? "Yes" : "No"} tone={item.reason.thursdayWouldHelp ? "warning" : undefined} />
            <Stat label="Manual override required" value={item.reason.overrideRequired ? "Yes" : "No"} />
          </div>

          {item.reason.rejectedRooms.length > 0 && (
            <>
              <h4>Rejected rooms</h4>
              <ul className="reason-list">
                {item.reason.rejectedRooms.map((r, i) => (
                  <li key={`${r.roomId}-${i}`}>
                    <b>{r.roomId}</b>: {r.reason}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4>Ranked repair suggestions</h4>
          {!item.repairsComputed && (
            <Button
              className="ghost"
              onClick={() =>
                setItems(items.map((x) => (x.id === item.id ? { ...x, repairs: suggestRepairs(data, x.reason), repairsComputed: true } : x)))
              }
            >
              Suggest repairs for this meeting
            </Button>
          )}
          {item.repairs.map((repair) => (
            <div className="repair" key={repair.id}>
              <div>
                <b>{repair.summary}</b>
                <p>{repair.detail}</p>
              </div>
              <Button className="secondary" onClick={() => applyOne(item, repair)}>
                Apply
              </Button>
            </div>
          ))}
          {item.repairsComputed && !item.repairs.length && <Empty text="No automatic repair is available; edit the schedule directly." />}

          <label htmlFor={`note-${item.id}`}>
            Leave unresolved with a documented reason
            <input
              id={`note-${item.id}`}
              value={notes[item.id] ?? ""}
              onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
              placeholder="e.g. waiting on the department to confirm room capacity"
            />
          </label>
          <div className="toolbar">
            <Link className="button ghost" href="/editor">
              Return to the editor
            </Link>
            <Button
              className="ghost"
              onClick={() => {
                if (!notes[item.id]?.trim()) {
                  setToast("Enter a reason before leaving an item unresolved.");
                  return;
                }
                setData({
                  ...data,
                  audit: [{ id: crypto.randomUUID(), at: new Date().toISOString(), action: `Left ${item.id} unresolved`, reason: notes[item.id] }, ...data.audit],
                });
                setToast("Reason recorded in the audit log.");
              }}
            >
              Record reason
            </Button>
          </div>
        </div>
      ))}

      {items.length > shown && (
        <Button className="ghost" onClick={() => setShown(shown + 25)}>
          Show 25 more ({items.length - shown} remaining)
        </Button>
      )}

      <ImpactDialog
        preview={pending ? previewImpact(data, pending.next) : null}
        title="Review the effect of this repair"
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmPending()}
      />
    </>
  );
}

/* ------------------------------------------------ College mapping/export */

export function CollegesPage() {
  const { data, setData, setDataWithSnapshot, setToast, locale } = useApp();
  const [errors, setErrors] = useState<FormError[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedCollege, setSelectedCollege] = useState("");
  if (!data) return <Loading />;

  const pairs = trackDepartmentPairs(data);
  const summaries = collegeSummaries(data);
  const gate = bulkExportGate(data);
  const calendar = icsGate(data);
  const unmapped = unmappedAssignments(data);

  const setMapping = (track: string, department: string, collegeIds: string[]) => {
    const next: CollegeMapping = { track, department, collegeIds, confirmed: collegeIds.length > 0 };
    setData({
      ...data,
      collegeMappings: [...data.collegeMappings.filter((m) => !(m.track === track && m.department === department)), next],
      // Existing assignments pick the mapping up immediately.
      assignments: data.assignments.map((a) =>
        (a.track ?? "") === track && (a.department ?? "") === department ? { ...a, collegeIds } : a,
      ),
    });
  };

  const exportOne = async (collegeId: string) => {
    setBusy(true);
    try {
      const result = buildCollegeWorkbook(data, collegeId);
      downloadBlob(result.filename, result.bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const recorded = recordPackage(data, { collegeId, filename: result.filename, assignmentCount: result.assignmentCount, bytes: result.bytes });
      setData(recorded.data);
      setToast(`${result.filename} generated locally and recorded in the distribution log. Nothing was sent anywhere.`);
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async () => {
    if (!gate.allowed) {
      setErrors([{ field: "college-mappings", message: gate.reason }]);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const { exports, zip, filename } = buildAllColleges(data);
      downloadBlob(filename, zip, "application/zip");
      let next = data;
      for (const item of exports) {
        next = recordPackage(next, { collegeId: item.collegeId, filename: item.filename, assignmentCount: item.assignmentCount, bytes: item.bytes }).data;
      }
      await setDataWithSnapshot("Before recording bulk college export", next);
      setToast(`${exports.length} college workbook(s) bundled into ${filename}. Each package was recorded locally.`);
    } finally {
      setBusy(false);
    }
  };

  const exportIcs = (collegeId: string) => {
    if (!calendar.allowed) {
      setErrors([{ field: "college-ics", message: calendar.reason }]);
      return;
    }
    setErrors([]);
    const assignments = data.assignments.filter((a) => (a.collegeIds ?? []).includes(collegeId));
    const ics = buildIcs(data, assignments, { versionId: data.approvedVersionId ?? "draft", locale });
    downloadBlob(`uqu-${collegeId}-${data.settings.semester}.ics`, ics, "text/calendar;charset=utf-8");
    setToast("Calendar file exported with Asia/Riyadh times and stable event identifiers.");
  };

  return (
    <>
      <PageTitle title="Colleges & exports" subtitle="Map every track and department to a college, then export one isolated workbook per college." />
      <ErrorSummary errors={errors} />
      {unmapped.length > 0 && (
        <div className="notice" id="college-mappings">
          <AlertTriangle />
          <span>
            {unmapped.length} assignment(s) have no college. Bulk export is blocked until each is mapped or filed explicitly under غير مصنف.
          </span>
        </div>
      )}

      <Card>
        <h2>Track and department mapping</h2>
        {pairs.map((pair) => {
          const mapping = findMapping(data.collegeMappings, pair.track, pair.department);
          return (
            <div className="mapping-row" key={`${pair.track}|${pair.department}`}>
              <span>{pair.track || "—"}</span>
              <span>{pair.department || "—"}</span>
              <select
                multiple
                aria-label={`Colleges for ${pair.track} / ${pair.department}`}
                value={mapping?.collegeIds ?? []}
                onChange={(e) => setMapping(pair.track, pair.department, Array.from(e.target.selectedOptions).map((o) => o.value))}
              >
                {data.colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr} — {c.nameEn}
                  </option>
                ))}
              </select>
              <span>
                {pair.assignments} assignments {mapping?.confirmed ? <Badge tone="success">mapped</Badge> : <Badge tone="warning">unmapped</Badge>}
              </span>
            </div>
          );
        })}
        {!pairs.length && <Empty text="No imported track/department pairs yet." />}
      </Card>

      <Card className="table-wrap">
        <div className="card-head">
          <div>
            <h2>Export preview</h2>
            <p>Each workbook contains only that college&apos;s schedule, sections, rooms, and notes.</p>
          </div>
          <div className="toolbar">
            <select aria-label="College to export" value={selectedCollege} onChange={(e) => setSelectedCollege(e.target.value)}>
              <option value="">Choose a college…</option>
              {exportableColleges(data).map((id) => (
                <option key={id} value={id}>
                  {data.colleges.find((c) => c.id === id)?.nameAr ?? id}
                </option>
              ))}
            </select>
            <Button disabled={!selectedCollege || busy} onClick={() => void exportOne(selectedCollege)}>
              <FileSpreadsheet /> تصدير الكلية المحددة
            </Button>
            <Button className="secondary" disabled={busy || !gate.allowed} onClick={() => void exportAll()}>
              <Package /> تصدير جميع الكليات (ZIP)
            </Button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>College</th>
              <th>Sections</th>
              <th>Assignments</th>
              <th>Remote (عن بُعد)</th>
              <th>In person</th>
              <th>Shared</th>
              <th>Warnings</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.collegeId}>
                <td>
                  <b>{s.nameAr}</b>
                  <small>{s.nameEn}</small>
                  {s.collegeId === UNCLASSIFIED_COLLEGE_ID && <Badge tone="warning">غير مصنف</Badge>}
                </td>
                <td>{s.sections}</td>
                <td>{s.assignments}</td>
                <td>{s.remote}</td>
                <td>{s.inPerson}</td>
                <td>{s.shared}</td>
                <td>{s.warnings}</td>
                <td>
                  <Button className="ghost" onClick={() => void exportOne(s.collegeId)} disabled={busy}>
                    <Download /> xlsx
                  </Button>
                  <Button className="ghost" onClick={() => exportIcs(s.collegeId)} disabled={!calendar.allowed}>
                    <CalendarDays /> ICS
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!summaries.length && <Empty text="No assignments to export yet." />}
      </Card>

      <Card id="college-ics">
        <h2>Calendar export</h2>
        {calendar.allowed ? (
          <p>
            <CheckCircle2 aria-hidden="true" /> Every period has a confirmed clock time. Calendar files use Asia/Riyadh and stable event identifiers, so regenerating the same approved version never creates duplicates.
          </p>
        ) : (
          <div className="notice">
            <AlertTriangle />
            <span>
              {calendar.reason} <Link href="/rules">Configure period clock times</Link>.
            </span>
          </div>
        )}
      </Card>
    </>
  );
}

/* ---------------------------------------------------- Distribution log */

export function DistributionLog() {
  const { data, setData, setToast, locale } = useApp();
  if (!data) return <Loading />;
  const warnings = distributionWarnings(data, locale);

  return (
    <>
      <PageTitle title="Distribution log" subtitle="Every package generated on this device. Nothing is emailed or uploaded automatically." />
      <div className="notice">
        <Info />
        <span>This log records files you generated and can hand over yourself. The app never claims a file was sent for you.</span>
      </div>
      {warnings.length > 0 && (
        <Card>
          <h2>Warnings</h2>
          <ul className="reason-list">
            {warnings.map((w, i) => (
              <li key={`${w.collegeId}-${i}`}>
                <span className={`severity ${w.severity}`}>{w.severity}</span> {w.message}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>College</th>
              <th>Version</th>
              <th>Exported</th>
              <th>Filename</th>
              <th>Assignments</th>
              <th>Exported by</th>
              <th>Package ID</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.distributions.map((p) => (
              <tr key={p.id}>
                <td>{data.colleges.find((c) => c.id === p.collegeId)?.nameAr ?? p.collegeId}</td>
                <td>{p.versionName}</td>
                <td>{new Date(p.exportedAt).toLocaleString()}</td>
                <td className="source-ref">{p.filename}</td>
                <td>{p.assignmentCount}</td>
                <td>{p.exportedBy}</td>
                <td className="source-ref">{p.checksum}</td>
                <td>
                  <Badge tone={p.status === "outdated" ? "danger" : p.status === "delivered" ? "success" : p.status === "replaced" ? "warning" : "neutral"}>{p.status}</Badge>
                </td>
                <td>
                  {p.status !== "delivered" && (
                    <Button
                      className="ghost"
                      onClick={() => {
                        setData(markDelivered(data, p.id));
                        setToast("Marked as manually delivered");
                      }}
                    >
                      <Send /> Mark delivered
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.distributions.length && <Empty text="No packages generated yet." />}
      </Card>
    </>
  );
}

/* --------------------------------------------------- Approval workflow */

export function WorkflowPage() {
  const { data, setData, setToast, locale } = useApp();
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FormError[]>([]);
  if (!data) return <Loading />;
  const report = runQualityChecks(data);

  const run = (result: ReturnType<typeof sendForReview>) => {
    if (!result.ok) {
      setErrors([{ field: "workflow-reason", message: result.message }]);
      setToast(result.message);
      return;
    }
    setErrors([]);
    setData(result.data);
    setToast(result.message);
  };

  return (
    <>
      <PageTitle
        title="Approval & publication"
        subtitle="Draft, under review, approved, distributed, superseded. There is no authentication, so the operator name below is a recorded label, not a verified identity."
        actions={<span className={`state-pill ${data.scheduleState}`}>{locale === "ar" ? STATE_LABELS[data.scheduleState].ar : STATE_LABELS[data.scheduleState].en}</span>}
      />
      <ErrorSummary errors={errors} />
      <div className="stat-row">
        <Stat label="Blocking errors" value={report.counts.error} tone={report.counts.error ? "danger" : "success"} />
        <Stat label="Warnings" value={report.counts.warning} />
        <Stat label="Version number" value={data.settings.scheduleVersionNumber} />
        <Stat label="Operator" value={data.settings.operatorName} />
        <Stat label="Editing" value={isLocked(data.scheduleState) ? "Locked" : "Open"} tone={isLocked(data.scheduleState) ? "warning" : "success"} />
      </div>

      <Card>
        <h2>Move the schedule forward</h2>
        <div className="toolbar">
          <Button disabled={data.scheduleState !== "draft"} onClick={() => run(sendForReview(data))}>
            <Send /> Send for review
          </Button>
          <Button disabled={data.scheduleState !== "review"} onClick={() => run(approve(data))}>
            <CheckCircle2 /> Approve
          </Button>
          <Button disabled={data.scheduleState !== "approved"} onClick={() => run(distribute(data))}>
            <Package /> Record as distributed
          </Button>
        </div>
        <p className="footnote">
          Approval requires zero blocking errors in the Data Quality Center. Sending for review takes a version snapshot first.
        </p>
      </Card>

      <Card>
        <h2>Reopen an approved schedule</h2>
        <p>Reopening needs a written reason, creates a new draft version, and marks previously exported college packages outdated.</p>
        <label htmlFor="workflow-reason">
          Reason
          <input id="workflow-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. a department requested a room change" aria-invalid={errors.some((e) => e.field === "workflow-reason")} />
        </label>
        <Button
          disabled={!isLocked(data.scheduleState)}
          onClick={() => {
            const result = reopen(data, reason);
            run(result);
            if (result.ok) setReason("");
          }}
        >
          <Unlock /> Reopen as a new draft
        </Button>
      </Card>

      <Card>
        <h2>Operator name</h2>
        <label htmlFor="workflow-operator">
          Local operator / author label
          <input id="workflow-operator" value={data.settings.operatorName} onChange={(e) => setData({ ...data, settings: { ...data.settings, operatorName: e.target.value } })} />
        </label>
        <p className="footnote">Stored locally and written onto versions, exports, and distribution packages.</p>
      </Card>

      <Card className="table-wrap">
        <h2>Audit log</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {data.audit.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.at).toLocaleString()}</td>
                <td>{entry.action}</td>
                <td>{entry.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.audit.length && <Empty text="No recorded actions yet." />}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------ Bulk edit */

export function BulkEditPage() {
  const { data, setDataWithSnapshot, setToast } = useApp();
  const [entity, setEntity] = useState<"assignments" | "rooms" | "faculty">("assignments");
  const [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState<BulkAction>({ kind: "set-lock", locked: true });
  const [result, setResult] = useState<ReturnType<typeof applyBulk> | null>(null);
  const [pending, setPending] = useState<ReturnType<typeof applyBulk> | null>(null);
  if (!data) return <Loading />;

  const rows: { id: string; label: string }[] =
    entity === "assignments"
      ? data.assignments.map((a) => ({ id: a.id, label: `${a.courseCode} ${a.activity ?? ""} · ${a.sectionId} · ${a.day} · ${a.roomId ?? "عن بُعد"}` }))
      : entity === "rooms"
        ? data.rooms.map((r) => ({ id: r.id, label: `${r.id} · ${r.building} · ${r.capacity === null ? "capacity unknown" : r.capacity}` }))
        : data.faculty.map((f) => ({ id: f.id, label: `${f.id} · ${f.nameEn}` }));

  const preview = () => {
    if (!selected.length) {
      setToast("Select at least one record.");
      return;
    }
    setPending(applyBulk(data, selected, action));
  };

  const confirm = async () => {
    if (!pending) return;
    await setDataWithSnapshot(`Before bulk action on ${selected.length} record(s)`, pending.data);
    setResult(pending);
    setPending(null);
    setToast(
      pending.partial
        ? `Partial result: ${pending.applied} applied, ${pending.warnings} with warnings, ${pending.blocked} blocked. A rollback snapshot was saved.`
        : `${pending.applied} record(s) updated. A rollback snapshot was saved.`,
    );
  };

  return (
    <>
      <PageTitle title="Bulk editing" subtitle="Validate, preview, apply, and roll back. Partial success is always reported as partial." />
      <Card>
        <div className="filter-bar">
          <label>
            Records
            <select
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value as typeof entity);
                setSelected([]);
              }}
            >
              <option value="assignments">Schedule assignments</option>
              <option value="rooms">Rooms</option>
              <option value="faculty">Faculty</option>
            </select>
          </label>
          <label>
            Action
            <select
              value={action.kind}
              onChange={(e) => {
                const kind = e.target.value as BulkAction["kind"];
                const next: Record<BulkAction["kind"], BulkAction> = {
                  "assign-college": { kind: "assign-college", collegeIds: [data.colleges[0]?.id ?? UNCLASSIFIED_COLLEGE_ID] },
                  "assign-faculty": { kind: "assign-faculty", facultyId: data.faculty[0]?.id ?? "" },
                  "assign-room": { kind: "assign-room", roomId: data.rooms[0]?.id ?? null },
                  "set-delivery": { kind: "set-delivery", mode: "remote" },
                  "set-lock": { kind: "set-lock", locked: true },
                  move: { kind: "move", day: data.settings.days[0], periods: [1, 2] },
                  "set-capacity": { kind: "set-capacity", capacity: 40 },
                  "set-room-type": { kind: "set-room-type", type: "Classroom" },
                  "set-availability": { kind: "set-availability", days: data.settings.days },
                };
                setAction(next[kind]);
              }}
            >
              <option value="set-lock">Lock or unlock</option>
              <option value="assign-college">Assign or change college</option>
              <option value="assign-faculty">Assign or change faculty</option>
              <option value="assign-room">Assign or change room</option>
              <option value="set-delivery">Mark delivery mode</option>
              <option value="move">Move compatible assignments</option>
              <option value="set-capacity">Change room capacity</option>
              <option value="set-room-type">Change room type</option>
              <option value="set-availability">Change availability</option>
            </select>
          </label>
          <BulkActionFields action={action} setAction={setAction} />
          <Button onClick={preview} disabled={!selected.length}>
            Preview impact
          </Button>
        </div>
        <div className="toolbar">
          <Button className="ghost" onClick={() => setSelected(rows.map((r) => r.id))}>
            Select all ({rows.length})
          </Button>
          <Button className="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      </Card>

      <Card className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="checkbox-cell">
                <span className="sr-only">Select</span>
              </th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="checkbox-cell">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.id}`}
                    checked={selected.includes(row.id)}
                    onChange={(e) => setSelected(e.target.checked ? [...selected, row.id] : selected.filter((x) => x !== row.id))}
                  />
                </td>
                <td>{row.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {result && (
        <Card className="table-wrap">
          <div className="card-head">
            <h2>Result</h2>
            <div className="toolbar">
              <Badge tone="success">{result.applied} applied</Badge>
              <Badge tone="warning">{result.warnings} with warnings</Badge>
              <Badge tone="danger">{result.blocked} blocked</Badge>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Record</th>
                <th>Status</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {result.outcomes.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>
                    <span className={`severity ${o.status === "blocked" ? "error" : o.status === "warning" ? "warning" : "info"}`}>{o.status}</span>
                  </td>
                  <td>{o.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="footnote">
            Roll this back from <Link href="/versions">Versions → rollback snapshots</Link>.
          </p>
        </Card>
      )}

      <Dialog open={Boolean(pending)} title="Bulk change preview" onClose={() => setPending(null)}>
        {pending && (
          <>
            <div className="stat-row">
              <Stat label="Will apply" value={pending.applied} tone="success" />
              <Stat label="With warnings" value={pending.warnings} tone="warning" />
              <Stat label="Blocked" value={pending.blocked} tone="danger" />
            </div>
            <ul className="reason-list">
              {pending.outcomes
                .filter((o) => o.status !== "applied")
                .slice(0, 10)
                .map((o) => (
                  <li key={o.id}>
                    <b>{o.id}</b>: {o.message}
                  </li>
                ))}
            </ul>
            <div className="toolbar">
              <Button onClick={() => void confirm()}>Apply and save a rollback snapshot</Button>
              <Button className="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

function BulkActionFields({ action, setAction }: { action: BulkAction; setAction: (a: BulkAction) => void }) {
  const { data } = useApp();
  if (!data) return null;
  if (action.kind === "set-lock") {
    return (
      <label>
        Lock state
        <select value={action.locked ? "lock" : "unlock"} onChange={(e) => setAction({ kind: "set-lock", locked: e.target.value === "lock" })}>
          <option value="lock">Lock</option>
          <option value="unlock">Unlock</option>
        </select>
      </label>
    );
  }
  if (action.kind === "assign-college") {
    return (
      <label>
        College
        <select value={action.collegeIds[0] ?? ""} onChange={(e) => setAction({ kind: "assign-college", collegeIds: [e.target.value] })}>
          {data.colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameAr}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (action.kind === "assign-faculty") {
    return (
      <label>
        Faculty
        <select value={action.facultyId} onChange={(e) => setAction({ kind: "assign-faculty", facultyId: e.target.value })}>
          {data.faculty.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nameEn}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (action.kind === "assign-room") {
    return (
      <label>
        Room
        <select value={action.roomId ?? ""} onChange={(e) => setAction({ kind: "assign-room", roomId: e.target.value || null })}>
          <option value="">No room (عن بُعد)</option>
          {data.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (action.kind === "set-delivery") {
    return (
      <label>
        Delivery mode
        <select value={action.mode} onChange={(e) => setAction({ kind: "set-delivery", mode: e.target.value as "remote" | "in-person" })}>
          <option value="remote">Remote (عن بُعد)</option>
          <option value="in-person">In person</option>
        </select>
      </label>
    );
  }
  if (action.kind === "move") {
    return (
      <>
        <label>
          Day
          <select value={action.day} onChange={(e) => setAction({ ...action, day: e.target.value })}>
            {data.settings.days.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Periods
          <input
            value={action.periods.join(", ")}
            onChange={(e) => setAction({ ...action, periods: e.target.value.split(",").map((v) => Number(v.trim())).filter(Boolean) })}
          />
        </label>
      </>
    );
  }
  if (action.kind === "set-capacity") {
    return (
      <label>
        Capacity (blank = unknown)
        <input type="number" value={action.capacity ?? ""} onChange={(e) => setAction({ kind: "set-capacity", capacity: e.target.value === "" ? null : Number(e.target.value) })} />
      </label>
    );
  }
  if (action.kind === "set-room-type") {
    return (
      <label>
        Room type
        <input value={action.type} onChange={(e) => setAction({ kind: "set-room-type", type: e.target.value })} />
      </label>
    );
  }
  return (
    <label>
      Available days
      <input value={action.days.join(", ")} onChange={(e) => setAction({ kind: "set-availability", days: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} />
    </label>
  );
}

export { Lock };
