"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "@e965/xlsx";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  Play,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Unlock,
} from "lucide-react";
import { useApp } from "../app-provider";
import { Badge, Button, Card, Dialog, Empty, ErrorSummary, FieldError, Loading, PageTitle, Stat, downloadBlob, type FormError } from "../ui-kit";
import { allConflicts, conflictsFor, generate, type GenerateResult } from "@/lib/engine";
import { loadSummary } from "@/lib/rules";
import { searchAssignments } from "@/lib/search";
import type { Assignment, Course, Faculty, Room, ScheduleVersion, Section } from "@/lib/types";
import { REMOTE_ACTIVITY } from "@/lib/types";
import { isRemote, physicalThursdayCount, preparatorySummary, isPreparatorySection, roomLabel, applyRemoteRule } from "@/lib/schedule-rules";
import { clockTimesComplete, defaultPeriodTable, periodsToRange } from "@/lib/period-table";
import { periodLabelAr, periodLabelEn } from "@/lib/uqu/periods";
import { runQualityChecks } from "@/lib/quality";
import { previewImpact, type ImpactPreview } from "@/lib/impact";
import { guardEdit, STATE_LABELS } from "@/lib/workflow";
import { unmappedAssignments } from "@/lib/colleges";

/** Human label for a meeting's time. Periods are shown until clock times exist. */
export function timeLabel(data: { settings: { periods: { period: number; start: string; end: string; confirmed: boolean }[] } }, a: Assignment, locale: "ar" | "en") {
  const periods = a.periods ?? [];
  if (!periods.length) return `${a.start}–${a.end}`;
  if (!clockTimesComplete(data.settings)) return locale === "ar" ? periodLabelAr(periods) : periodLabelEn(periods);
  const range = periodsToRange(data.settings, periods);
  return range ? `${range.start}–${range.end}` : periodLabelEn(periods);
}

/* ------------------------------------------------------------- Dashboard */

export function Dashboard() {
  const { data, locale } = useApp();
  if (!data) return <Loading />;
  const conflicts = allConflicts(data);
  const report = runQualityChecks(data);
  const scheduled = data.assignments.length;
  const required = data.sections.reduce(
    (n, s) => n + s.courseCodes.reduce((x, c) => x + (data.courses.find((k) => k.code === c)?.meetingsPerWeek || 0), 0),
    0,
  );
  const unscheduled = Math.max(0, required - scheduled);
  const loads = data.faculty.map((f) => loadSummary(f, data.assignments, data.settings));
  const remote = data.assignments.filter(isRemote).length;
  const metrics: [string, React.ReactNode][] = [
    ["Faculty", data.faculty.length],
    ["Courses", data.courses.length],
    ["Sections", data.sections.length],
    ["Rooms", data.rooms.length],
    ["Scheduled", scheduled],
    ["Unscheduled", unscheduled],
    ["Conflicts", conflicts.length],
    ["Quality", `${Math.max(0, 100 - conflicts.length * 8)}%`],
  ];

  return (
    <>
      <PageTitle
        title="Scheduling command center"
        subtitle="Live metrics derived from the current local dataset."
        actions={<span className={`state-pill ${data.scheduleState}`}>{locale === "ar" ? STATE_LABELS[data.scheduleState].ar : STATE_LABELS[data.scheduleState].en}</span>}
      />
      <div className="notice">
        <AlertTriangle />
        <span>
          <b>Internal scheduling prototype.</b> Confirm institutional and departmental rules before operational use. All demo people are fictional.
        </span>
      </div>
      <div className="metric-grid">
        {metrics.map(([k, v]) => (
          <Card key={k}>
            <span>{k}</span>
            <strong>{v}</strong>
          </Card>
        ))}
      </div>
      <div className="two-col">
        <Card>
          <div className="card-head">
            <div>
              <h2>Readiness</h2>
              <p>Meetings and data coverage</p>
            </div>
            <Badge tone={conflicts.length ? "danger" : "success"}>{conflicts.length ? `${conflicts.length} issues` : "Ready"}</Badge>
          </div>
          <div className="progress">
            <i style={{ width: `${required ? (scheduled / required) * 100 : 0}%` }} />
          </div>
          <p>
            {scheduled} of {required} required meetings scheduled
          </p>
          <div className="stat-row">
            <Stat label="Remote meetings (عن بُعد)" value={remote} />
            <Stat label="In-person Thursday" value={physicalThursdayCount(data.assignments)} tone={physicalThursdayCount(data.assignments) ? "warning" : "success"} />
            <Stat label="Overtime units" value={loads.reduce((n, x) => n + x.overtime, 0)} />
            <Stat label="Underloads" value={loads.filter((x) => x.underload > 0).length} />
            <Stat label="Unmapped colleges" value={unmappedAssignments(data).length} tone={unmappedAssignments(data).length ? "danger" : "success"} />
          </div>
          <p className="footnote">
            Unscheduled meetings: <b>{unscheduled}</b>. <Link href="/unscheduled">Open the unscheduled queue</Link> for the reason behind each one.
          </p>
        </Card>
        <Card>
          <div className="card-head">
            <div>
              <h2>Immediate attention</h2>
              <p>Top findings from the Data Quality Center</p>
            </div>
            <Badge tone={report.counts.error ? "danger" : report.counts.warning ? "warning" : "success"}>
              {report.counts.error} errors · {report.counts.warning} warnings
            </Badge>
          </div>
          <div className="issue-list">
            {report.issues.slice(0, 5).map((issue) => (
              <div key={issue.id}>
                <AlertTriangle />
                <span>{locale === "ar" ? issue.messageAr : issue.messageEn}</span>
              </div>
            ))}
            {!report.issues.length && <Empty text="No data quality issues detected." />}
          </div>
          <p className="footnote">
            <Link href="/quality">Open the Data Quality Center</Link>
          </p>
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- Generator */

export function Generator() {
  const { data, setDataWithSnapshot, setToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [alts, setAlts] = useState<GenerateResult[]>([]);
  if (!data) return <Loading />;

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const results = [generate(data, "balanced"), generate(data, "faculty"), generate(data, "compact")];
      setAlts(results);
      setBusy(false);
      const total = results.reduce((n, r) => n + r.unscheduled.length, 0);
      sessionStorage.setItem("uqu-unscheduled", JSON.stringify(results.find((r) => r.unscheduled.length)?.unscheduled ?? []));
      setToast(results.some((r) => r.ok) ? "Three deterministic alternatives evaluated" : `No valid schedule found. ${total} meeting(s) queued with reasons.`);
    }, 50);
  };

  return (
    <>
      <PageTitle title="Generate schedule" subtitle="Constraint-based scheduling that avoids in-person Thursday and never puts نشاط 2 in a room." />
      <Card>
        <div className="generator-bar">
          <div>
            <h2>Generation settings</h2>
            <p>
              {data.settings.timeoutMs / 1000}s timeout · Sunday–Wednesday tried first · in-person Thursday penalty {data.settings.thursdayInPersonPenalty} · remote Thursday penalty{" "}
              {data.settings.thursdayRemotePenalty}
            </p>
          </div>
          <Button onClick={run} disabled={busy}>
            {busy ? <RefreshCw className="spin" /> : <Play />}
            {busy ? "Generating…" : "Generate alternatives"}
          </Button>
        </div>
      </Card>
      <div className="three-col">
        {["Most balanced", "Best faculty preferences", "Most compact student schedule"].map((name, i) => {
          const result = alts[i];
          return (
            <Card key={name}>
              <div className="card-head">
                <h2>{name}</h2>
                {result && <Badge tone={result.ok ? "success" : "danger"}>{result.ok ? `${result.score}/100` : "No solution"}</Badge>}
              </div>
              {result ? (
                <>
                  <p>
                    {result.assignments.length} meetings · {result.warnings.length} warnings · {result.unscheduled.length} unscheduled
                  </p>
                  <ul className="compact-list">
                    <li>{i === 1 ? "Preference matching prioritized" : i === 2 ? "Earlier compact periods prioritized" : "Weekly balance prioritized"}</li>
                    <li>In-person Thursday used only as a last resort</li>
                    {result.thursdayExplanations.slice(0, 2).map((t) => (
                      <li key={t.assignmentId}>{t.reason}</li>
                    ))}
                  </ul>
                  {result.ok && (
                    <Button
                      className="secondary"
                      onClick={() => {
                        const version: ScheduleVersion = {
                          id: crypto.randomUUID(),
                          name: `Backup before ${name}`,
                          date: new Date().toISOString(),
                          author: data.settings.operatorName,
                          operator: data.settings.operatorName,
                          summary: "Automatic backup before generation",
                          conflicts: allConflicts(data).length,
                          score: 100 - allConflicts(data).length * 8,
                          status: "archived",
                          state: data.scheduleState,
                          assignments: data.assignments,
                        };
                        void setDataWithSnapshot(`Before applying "${name}"`, { ...data, versions: [...data.versions, version], assignments: result.assignments });
                        setToast(`${name} opened in the editor. A rollback snapshot was saved first.`);
                      }}
                    >
                      Use alternative <ArrowRight />
                    </Button>
                  )}
                  {!result.ok && (
                    <Link className="button ghost" href="/unscheduled">
                      Open unscheduled queue
                    </Link>
                  )}
                </>
              ) : (
                <Empty text="Run the generator to compare this option." />
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Editor */

export function Editor() {
  const { data, setData, setToast, locale } = useApp();
  const [q, setQ] = useState("");
  const [facultyFilter, setFacultyFilter] = useState("");
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [history, setHistory] = useState<Assignment[][]>([]);
  const [future, setFuture] = useState<Assignment[][]>([]);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [pending, setPending] = useState<{ next: Assignment[]; impact: ImpactPreview; label: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);

  useEffect(() => {
    // Deep links open a specific assignment. Read after paint so the effect
    // does not schedule a synchronous cascading render.
    queueMicrotask(() => {
      const id = new URLSearchParams(window.location.search).get("assignment");
      if (id && data) setSelected(data.assignments.find((a) => a.id === id) ?? null);
    });
  }, [data]);

  if (!data) return <Loading />;
  const rows = searchAssignments(data, q, { faculty: facultyFilter });
  const lockMessage = guardEdit(data);

  const commit = (next: Assignment[], label: string) => {
    const after = { ...data, assignments: next };
    const impact = previewImpact(data, after);
    if (impact.material) {
      setPending({ next, impact, label });
      return;
    }
    setHistory([...history, data.assignments]);
    setFuture([]);
    setData(after);
    setToast(label);
  };

  const applyPending = () => {
    if (!pending) return;
    setHistory([...history, data.assignments]);
    setFuture([]);
    setData({ ...data, assignments: pending.next });
    setToast(pending.label);
    setPending(null);
  };

  const update = (candidate: Assignment) => {
    if (lockMessage) {
      setErrors([{ field: "editor-day", message: lockMessage }]);
      return;
    }
    const normalized = applyRemoteRule(candidate) as Assignment;
    const next = data.assignments.map((x) => (x.id === normalized.id ? normalized : x));
    const problems = conflictsFor(normalized, next, data);
    const blocking = problems.filter((p) => p.type !== "thursday" || !normalized.thursdayReason);
    if (blocking.length && !normalized.overrideReason) {
      setErrors(blocking.map((p) => ({ field: p.type === "thursday" ? "editor-thursday" : "editor-day", message: p.message })));
      return;
    }
    setErrors([]);
    setSelected(normalized);
    commit(next, "Assignment updated");
  };

  const moveTo = (assignmentId: string, day: string) => {
    const assignment = data.assignments.find((a) => a.id === assignmentId);
    if (!assignment) return;
    if (assignment.locked) {
      setErrors([{ field: "editor-day", message: `${assignment.id} is locked and was not moved.` }]);
      return;
    }
    update({ ...assignment, day, thursdayReason: day === "Thursday" && !isRemote(assignment) ? assignment.thursdayReason : undefined });
  };

  return (
    <>
      <PageTitle title="Schedule editor" subtitle="Search, filter, drag, move by keyboard, lock, and validate meetings immediately." />
      {lockMessage && (
        <div className="notice">
          <AlertTriangle />
          <span>{lockMessage}</span>
        </div>
      )}
      <ErrorSummary errors={errors} />
      <Card>
        <div className="toolbar">
          <label className="search">
            <Search />
            <span className="sr-only">Search</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, codes, sections, rooms…" />
          </label>
          <select aria-label="Faculty filter" value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value)}>
            <option value="">All faculty</option>
            {data.faculty.map((f) => (
              <option key={f.id} value={f.id}>
                {locale === "ar" ? f.nameAr : f.nameEn}
              </option>
            ))}
          </select>
          <Button
            className="ghost"
            disabled={!history.length}
            onClick={() => {
              setFuture([data.assignments, ...future]);
              const prev = history[history.length - 1];
              setData({ ...data, assignments: prev });
              setHistory(history.slice(0, -1));
            }}
          >
            <RotateCcw /> Undo
          </Button>
          <Button
            className="ghost"
            disabled={!future.length}
            onClick={() => {
              setHistory([...history, data.assignments]);
              setData({ ...data, assignments: future[0] });
              setFuture(future.slice(1));
            }}
          >
            Redo
          </Button>
          <Button className="ghost" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </Card>
      <div className="editor-layout">
        <Card className="schedule-card">
          <div className="schedule-grid">
            {data.settings.days.map((day) => (
              <div
                className={`day-column${dropDay === day ? " drop-target" : ""}`}
                key={day}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropDay(day);
                }}
                onDragLeave={() => setDropDay((d) => (d === day ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropDay(null);
                  const id = e.dataTransfer.getData("text/plain") || dragging;
                  if (id) moveTo(id, day);
                }}
              >
                <h3>{day}</h3>
                {rows
                  .filter((a) => a.day === day)
                  .map((a) => {
                    const course = data.courses.find((x) => x.code === a.courseCode);
                    const problems = conflictsFor(a, data.assignments, data);
                    return (
                      <button
                        key={a.id}
                        draggable={!a.locked && !lockMessage}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", a.id);
                          setDragging(a.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => setSelected(a)}
                        className={`assignment ${problems.length ? "has-conflict" : ""}${dragging === a.id ? " dragging" : ""}`}
                      >
                        <div>
                          <b>{course?.code}</b>
                          {a.locked ? <Lock /> : null}
                        </div>
                        <span>{timeLabel(data, a, locale)}</span>
                        <small>
                          {a.activity ? `${a.activity} · ` : ""}
                          {roomLabel(a, locale)}
                        </small>
                        {problems.length > 0 && (
                          <em>
                            ⚠ {problems.length} issue{problems.length > 1 ? "s" : ""}
                          </em>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
          {!rows.length && <Empty text="No assignments match the search and filters." />}
          <p className="drag-hint">
            Drag a card onto another day, or select it and use the form on the right. The form is the full keyboard and mobile alternative to dragging.
          </p>
        </Card>
        <Card className="detail-panel">
          {selected ? (
            <>
              <div className="card-head">
                <h2>Assignment</h2>
                <Badge tone={conflictsFor(selected, data.assignments, data).length ? "danger" : "success"}>
                  {conflictsFor(selected, data.assignments, data).length ? "Conflict" : "Valid"}
                </Badge>
              </div>
              <p className="footnote">
                {selected.activity ?? "—"} · {isRemote(selected) ? "عن بُعد (remote, no room)" : "In person"}
              </p>
              <label htmlFor="editor-day">
                Day
                <select id="editor-day" value={selected.day} onChange={(e) => setSelected({ ...selected, day: e.target.value })}>
                  {data.settings.days.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="editor-periods">
                Periods (comma separated)
                <input
                  id="editor-periods"
                  value={(selected.periods ?? []).join(", ")}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      periods: e.target.value
                        .split(",")
                        .map((v) => Number(v.trim()))
                        .filter((v) => Number.isFinite(v) && v > 0),
                    })
                  }
                  placeholder="e.g. 5, 6, 7, 8"
                />
              </label>
              <div className="field-row">
                <label>
                  Start
                  <input type="time" value={selected.start} onChange={(e) => setSelected({ ...selected, start: e.target.value })} />
                </label>
                <label>
                  End
                  <input type="time" value={selected.end} onChange={(e) => setSelected({ ...selected, end: e.target.value })} />
                </label>
              </div>
              <label htmlFor="editor-room">
                Room
                <select
                  id="editor-room"
                  value={selected.roomId ?? ""}
                  disabled={isRemote(selected)}
                  onChange={(e) => setSelected({ ...selected, roomId: e.target.value || null })}
                >
                  <option value="">{isRemote(selected) ? "عن بُعد — no room" : "No room"}</option>
                  {data.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id}
                      {r.capacity === null ? " (capacity unknown)" : ` (${r.capacity})`}
                    </option>
                  ))}
                </select>
              </label>
              {isRemote(selected) && <FieldError id="editor-room" message={`${REMOTE_ACTIVITY} is delivered عن بُعد and never receives a room.`} />}
              {selected.day === "Thursday" && !isRemote(selected) && (
                <label htmlFor="editor-thursday">
                  Thursday reason (required)
                  <input
                    id="editor-thursday"
                    aria-invalid={!selected.thursdayReason}
                    value={selected.thursdayReason ?? ""}
                    onChange={(e) => setSelected({ ...selected, thursdayReason: e.target.value })}
                    placeholder="Why must this be taught in person on Thursday?"
                  />
                </label>
              )}
              <label htmlFor="editor-override">
                Override reason
                <input id="editor-override" value={selected.overrideReason || ""} onChange={(e) => setSelected({ ...selected, overrideReason: e.target.value })} placeholder="Required for authorized override" />
              </label>
              <Button onClick={() => update(selected)}>
                <Save />
                Apply valid move
              </Button>
              <Button className="secondary" onClick={() => update({ ...selected, locked: !selected.locked })}>
                {selected.locked ? <Unlock /> : <Lock />}
                {selected.locked ? "Unlock" : "Lock"}
              </Button>
            </>
          ) : (
            <Empty text="Select a meeting to edit it. This form is the keyboard and mobile alternative to drag-and-drop." />
          )}
        </Card>
      </div>
      <ImpactDialog preview={pending?.impact ?? null} onCancel={() => setPending(null)} onConfirm={applyPending} />
    </>
  );
}

/** Shared impact confirmation used before any material change. */
export function ImpactDialog({ preview, onCancel, onConfirm, title = "Review the effect of this change" }: { preview: ImpactPreview | null; onCancel: () => void; onConfirm: () => void; title?: string }) {
  return (
    <Dialog open={Boolean(preview)} title={title} onClose={onCancel}>
      {preview && (
        <>
          <div className="impact-grid">
            <Stat label="Assignments affected" value={preview.assignmentsAffected.length} />
            <Stat label="New conflicts" value={preview.newConflicts.length} tone={preview.newConflicts.length ? "danger" : "success"} />
            <Stat label="Resolved conflicts" value={preview.resolvedConflicts.length} tone="success" />
            <Stat label="Faculty loads changed" value={preview.facultyAffected.length} />
            <Stat label="Sections affected" value={preview.sectionsAffected.length} />
            <Stat label="Rooms affected" value={preview.roomsAffected.length} />
            <Stat label="Colleges affected" value={preview.collegesAffected.length} />
            <Stat label="Exports made outdated" value={preview.exportsOutdated.length} tone={preview.exportsOutdated.length ? "warning" : undefined} />
            <Stat label="In-person Thursday" value={`${preview.thursdayBefore} → ${preview.thursdayAfter}`} />
            <Stat label="Preparatory hours changed" value={preview.preparatoryChanges.length} />
          </div>
          {preview.approvalInvalidated && (
            <div className="notice">
              <AlertTriangle />
              <span>This change invalidates the current approval and creates work for the review cycle.</span>
            </div>
          )}
          {preview.newConflicts.length > 0 && (
            <ul className="reason-list">
              {preview.newConflicts.slice(0, 6).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <div className="toolbar">
            <Button onClick={onConfirm}>Confirm change</Button>
            <Button className="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/* --------------------------------------------------------------- Faculty */

const BLANK_FACULTY = (id: string): Faculty => ({
  id,
  nameEn: "",
  nameAr: "",
  rank: "Lecturer",
  specialization: "",
  campus: "",
  status: "Active",
  normalLimit: 16,
  available: [],
  unavailable: [],
  preferred: [],
  maxConsecutive: 3,
  preferredDays: [],
  overtimeAllowed: false,
  overtimeApproval: "not-required",
});

export function FacultyPage() {
  const { data, setData, setToast, locale } = useApp();
  const [editing, setEditing] = useState<Faculty | null>(null);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setOnlyDuplicates(new URLSearchParams(window.location.search).has("duplicates")));
  }, []);

  if (!data) return <Loading />;

  const duplicateIds = new Set(
    data.faculty
      .filter((f, _, all) => all.filter((x) => (x.nameAr || x.nameEn) === (f.nameAr || f.nameEn)).length > 1)
      .map((f) => f.id),
  );
  const visible = onlyDuplicates ? data.faculty.filter((f) => duplicateIds.has(f.id)) : data.faculty;

  const save = () => {
    if (!editing) return;
    const found: FormError[] = [];
    if (!editing.nameEn.trim()) found.push({ field: "faculty-nameEn", message: "English name is required." });
    if (!editing.nameAr.trim()) found.push({ field: "faculty-nameAr", message: "Arabic name is required." });
    if (!editing.specialization.trim()) found.push({ field: "faculty-spec", message: "Specialization is required." });
    if (!Number.isFinite(editing.normalLimit) || editing.normalLimit <= 0) found.push({ field: "faculty-load", message: "Normal load must be a positive number." });
    setErrors(found);
    if (found.length) return;
    const exists = data.faculty.some((f) => f.id === editing.id);
    setData({ ...data, faculty: exists ? data.faculty.map((f) => (f.id === editing.id ? editing : f)) : [...data.faculty, editing] });
    setToast(exists ? "Faculty record updated" : "Faculty record created");
    setEditing(null);
  };

  return (
    <>
      <PageTitle title="Faculty" subtitle="Editable workloads, availability, preferences, approvals, and workbook load categories." />
      <ErrorSummary errors={errors} />
      <Card>
        <div className="generator-bar">
          <p>
            <b>{data.faculty.length}</b> stored records
            {duplicateIds.size > 0 && (
              <>
                {" · "}
                <button className="link-button" onClick={() => setOnlyDuplicates(!onlyDuplicates)}>
                  {onlyDuplicates ? "Show all" : `${duplicateIds.size} share a display name`}
                </button>
              </>
            )}
          </p>
          <Button onClick={() => setEditing(BLANK_FACULTY(`F-${String(data.faculty.length + 1).padStart(3, "0")}`))}>
            <Plus />
            Add record
          </Button>
        </div>
      </Card>
      <Card className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Title</th>
              <th>Load source</th>
              <th>Assigned / limit</th>
              <th>Prep · Additional · Regular</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => {
              const summary = loadSummary(f, data.assignments, data.settings);
              return (
                <tr key={f.id}>
                  <td>{f.id}</td>
                  <td>
                    <b>{locale === "ar" ? f.nameAr : f.nameEn}</b>
                    <small>{locale === "ar" ? f.nameEn : f.nameAr}</small>
                    {duplicateIds.has(f.id) && <Badge tone="warning">duplicate name</Badge>}
                  </td>
                  <td>
                    {f.jobTitleAr || f.rank}
                    {f.external && <small>{f.affiliation}</small>}
                  </td>
                  <td>{summary.explicitLoads ? <Badge tone="success">workbook</Badge> : <Badge>rank default</Badge>}</td>
                  <td>
                    {summary.assigned}/{summary.limit}
                    {summary.overtime > 0 && <Badge tone="warning">+{summary.overtime}</Badge>}
                  </td>
                  <td>
                    {summary.preparatory} · {summary.additional} · {summary.regular}
                    <small>اضافية is an additional-program category, not approved overtime</small>
                  </td>
                  <td>{f.status}</td>
                  <td>
                    <button className="table-action" aria-label={`Edit ${f.id}`} onClick={() => setEditing(f)}>
                      <Save />
                    </button>
                    <button
                      className="table-action"
                      aria-label={`Delete ${f.id}`}
                      onClick={() => {
                        if (confirm(`Delete ${f.id}? Existing schedule references may become invalid.`)) {
                          setData({ ...data, faculty: data.faculty.filter((x) => x.id !== f.id) });
                          setToast("Faculty record deleted");
                        }
                      }}
                    >
                      <Trash2 />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Dialog open={Boolean(editing)} title={editing && data.faculty.some((f) => f.id === editing.id) ? "Edit faculty record" : "New faculty record"} onClose={() => setEditing(null)}>
        {editing && (
          <>
            <div className="field-row">
              <label htmlFor="faculty-nameEn">
                English name
                <input id="faculty-nameEn" value={editing.nameEn} aria-invalid={errors.some((e) => e.field === "faculty-nameEn")} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} />
                <FieldError id="faculty-nameEn" message={errors.find((e) => e.field === "faculty-nameEn")?.message} />
              </label>
              <label htmlFor="faculty-nameAr">
                Arabic name
                <input id="faculty-nameAr" value={editing.nameAr} aria-invalid={errors.some((e) => e.field === "faculty-nameAr")} onChange={(e) => setEditing({ ...editing, nameAr: e.target.value })} />
                <FieldError id="faculty-nameAr" message={errors.find((e) => e.field === "faculty-nameAr")?.message} />
              </label>
            </div>
            <div className="field-row">
              <label htmlFor="faculty-rank">
                Rank
                <select id="faculty-rank" value={editing.rank} onChange={(e) => setEditing({ ...editing, rank: e.target.value as Faculty["rank"] })}>
                  {["Professor", "Associate Professor", "Assistant Professor", "Lecturer", "Teaching Assistant", "Language Instructor"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="faculty-title">
                Local job title
                <input id="faculty-title" value={editing.jobTitleAr ?? ""} onChange={(e) => setEditing({ ...editing, jobTitleAr: e.target.value })} placeholder="معلم متقدم / معلم ممارس" />
              </label>
            </div>
            <div className="field-row">
              <label htmlFor="faculty-spec">
                Specialization
                <input id="faculty-spec" value={editing.specialization} aria-invalid={errors.some((e) => e.field === "faculty-spec")} onChange={(e) => setEditing({ ...editing, specialization: e.target.value })} />
                <FieldError id="faculty-spec" message={errors.find((e) => e.field === "faculty-spec")?.message} />
              </label>
              <label htmlFor="faculty-campus">
                Campus
                <input id="faculty-campus" value={editing.campus} onChange={(e) => setEditing({ ...editing, campus: e.target.value })} />
              </label>
            </div>
            <div className="field-row">
              <label htmlFor="faculty-load">
                Normal load
                <input id="faculty-load" type="number" value={editing.normalLimit} aria-invalid={errors.some((e) => e.field === "faculty-load")} onChange={(e) => setEditing({ ...editing, normalLimit: Number(e.target.value) })} />
                <FieldError id="faculty-load" message={errors.find((e) => e.field === "faculty-load")?.message} />
              </label>
              <label htmlFor="faculty-reduced">
                Reduced load (optional)
                <input id="faculty-reduced" type="number" value={editing.reducedLoad ?? ""} onChange={(e) => setEditing({ ...editing, reducedLoad: e.target.value ? Number(e.target.value) : undefined })} />
              </label>
            </div>
            <label htmlFor="faculty-days">
              Available days
              <input id="faculty-days" value={editing.available.map((p) => p.day).join(", ")} onChange={(e) => setEditing({ ...editing, available: e.target.value.split(",").map((d) => d.trim()).filter(Boolean).map((day) => ({ day, start: "08:00", end: "20:00" })) })} placeholder="Sunday, Monday, …" />
            </label>
            <div className="toolbar">
              <Button onClick={save}>
                <Save /> Save record
              </Button>
              <Button className="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------- Courses/sections */

export function Courses() {
  const { data, setData, setToast, locale } = useApp();
  const [course, setCourse] = useState<Course | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [errors, setErrors] = useState<FormError[]>([]);
  if (!data) return <Loading />;

  const saveCourse = () => {
    if (!course) return;
    const found: FormError[] = [];
    if (!course.code.trim()) found.push({ field: "course-code", message: "Course code is required." });
    if (!course.nameAr.trim() && !course.nameEn.trim()) found.push({ field: "course-nameEn", message: "A course name is required." });
    setErrors(found);
    if (found.length) return;
    const exists = data.courses.some((c) => c.code === course.code);
    setData({ ...data, courses: exists ? data.courses.map((c) => (c.code === course.code ? course : c)) : [...data.courses, course] });
    setToast(exists ? "Course updated" : "Course created");
    setCourse(null);
  };

  const saveSection = () => {
    if (!section) return;
    const found: FormError[] = [];
    if (!section.id.trim()) found.push({ field: "section-id", message: "Section identity is required." });
    if (!Number.isFinite(section.students) || section.students < 0) found.push({ field: "section-students", message: "Enrollment must be zero or more." });
    setErrors(found);
    if (found.length) return;
    const exists = data.sections.some((s) => s.id === section.id);
    setData({ ...data, sections: exists ? data.sections.map((s) => (s.id === section.id ? section : s)) : [...data.sections, section] });
    setToast(exists ? "Section updated" : "Section created");
    setSection(null);
  };

  return (
    <>
      <PageTitle title="Courses & sections" subtitle="Offerings, activity templates, preparatory hours, and shared student groups." />
      <ErrorSummary errors={errors} />
      <div className="two-col">
        <Card className="table-wrap">
          <div className="card-head">
            <h2>Courses · {data.courses.length}</h2>
            <Button onClick={() => setCourse({ code: "", nameEn: "", nameAr: "", program: "", level: 1, creditHours: 3, teachingType: "theoretical", specialization: "", meetingsPerWeek: 1, duration: 50, roomType: "Classroom" })}>
              <Plus /> Add
            </Button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Course</th>
                <th>Activities</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.courses.map((c) => (
                <tr key={c.code}>
                  <td>
                    <b>{c.code}</b>
                  </td>
                  <td>
                    {locale === "ar" ? c.nameAr : c.nameEn}
                    <small>{locale === "ar" ? c.nameEn : c.nameAr}</small>
                  </td>
                  <td>
                    {data.coursePatterns.filter((p) => p.courseCode === c.code).map((p) => (
                      <span className="pill" key={p.activity}>
                        {p.activity}: {p.periods}
                      </span>
                    ))}
                    {!data.coursePatterns.some((p) => p.courseCode === c.code) && <small>{c.meetingsPerWeek} × {c.duration} min</small>}
                  </td>
                  <td>
                    <button className="table-action" aria-label={`Edit ${c.code}`} onClick={() => setCourse(c)}>
                      <Save />
                    </button>
                    <button
                      className="table-action"
                      aria-label={`Delete ${c.code}`}
                      onClick={() => {
                        if (confirm(`Delete ${c.code}?`)) {
                          setData({ ...data, courses: data.courses.filter((x) => x.code !== c.code) });
                          setToast("Course deleted");
                        }
                      }}
                    >
                      <Trash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="table-wrap">
          <div className="card-head">
            <h2>Sections · {data.sections.length}</h2>
            <Button onClick={() => setSection({ id: "", program: "", level: 1, students: 0, campus: "", courseCodes: [], sharedGroups: [] })}>
              <Plus /> Add
            </Button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Section</th>
                <th>Students</th>
                <th>Preparatory hours</th>
                <th>Groups</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.sections.map((s) => {
                const prep = isPreparatorySection(s) ? preparatorySummary(s.id, data.assignments, data.settings) : null;
                return (
                  <tr key={s.id}>
                    <td>
                      <b>{s.sectionNumber ?? s.id}</b>
                      {s.track && <small>{s.track} / {s.department}</small>}
                    </td>
                    <td>{s.students}</td>
                    <td>
                      {prep ? (
                        <>
                          <Badge tone={prep.withinRange ? "success" : "warning"}>
                            {prep.inPersonPeriods} in person
                          </Badge>
                          <small>
                            {prep.remotePeriods} remote (عن بُعد) · {prep.combinedPeriods} combined
                          </small>
                        </>
                      ) : (
                        <small>Not preparatory</small>
                      )}
                    </td>
                    <td>{s.sharedGroups.join(", ")}</td>
                    <td>
                      <button className="table-action" aria-label={`Edit ${s.id}`} onClick={() => setSection(s)}>
                        <Save />
                      </button>
                      <button
                        className="table-action"
                        aria-label={`Delete ${s.id}`}
                        onClick={() => {
                          if (confirm(`Delete ${s.id}?`)) {
                            setData({ ...data, sections: data.sections.filter((x) => x.id !== s.id) });
                            setToast("Section deleted");
                          }
                        }}
                      >
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <Dialog open={Boolean(course)} title="Course" onClose={() => setCourse(null)}>
        {course && (
          <>
            <div className="field-row">
              <label htmlFor="course-code">
                Code
                <input id="course-code" value={course.code} aria-invalid={errors.some((e) => e.field === "course-code")} onChange={(e) => setCourse({ ...course, code: e.target.value })} />
                <FieldError id="course-code" message={errors.find((e) => e.field === "course-code")?.message} />
              </label>
              <label htmlFor="course-program">
                Program / track
                <input id="course-program" value={course.program} onChange={(e) => setCourse({ ...course, program: e.target.value })} />
              </label>
            </div>
            <div className="field-row">
              <label htmlFor="course-nameEn">
                English name
                <input id="course-nameEn" value={course.nameEn} onChange={(e) => setCourse({ ...course, nameEn: e.target.value })} />
                <FieldError id="course-nameEn" message={errors.find((e) => e.field === "course-nameEn")?.message} />
              </label>
              <label htmlFor="course-nameAr">
                Arabic name
                <input id="course-nameAr" value={course.nameAr} onChange={(e) => setCourse({ ...course, nameAr: e.target.value })} />
              </label>
            </div>
            <div className="field-row">
              <label htmlFor="course-meetings">
                Meetings per week
                <input id="course-meetings" type="number" value={course.meetingsPerWeek} onChange={(e) => setCourse({ ...course, meetingsPerWeek: Number(e.target.value) })} />
              </label>
              <label htmlFor="course-duration">
                Duration (minutes)
                <input id="course-duration" type="number" value={course.duration} onChange={(e) => setCourse({ ...course, duration: Number(e.target.value) })} />
              </label>
            </div>
            <div className="field-row">
              <label htmlFor="course-roomtype">
                Room type
                <input id="course-roomtype" value={course.roomType} onChange={(e) => setCourse({ ...course, roomType: e.target.value })} />
              </label>
              <label htmlFor="course-spec">
                Specialization
                <input id="course-spec" value={course.specialization} onChange={(e) => setCourse({ ...course, specialization: e.target.value })} />
              </label>
            </div>
            <div className="toolbar">
              <Button onClick={saveCourse}>
                <Save /> Save course
              </Button>
              <Button className="ghost" onClick={() => setCourse(null)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Dialog>

      <Dialog open={Boolean(section)} title="Section" onClose={() => setSection(null)}>
        {section && (
          <>
            <div className="field-row">
              <label htmlFor="section-id">
                Composite identity
                <input id="section-id" value={section.id} aria-invalid={errors.some((e) => e.field === "section-id")} onChange={(e) => setSection({ ...section, id: e.target.value })} />
                <FieldError id="section-id" message={errors.find((e) => e.field === "section-id")?.message} />
              </label>
              <label htmlFor="section-number">
                Section number
                <input id="section-number" value={section.sectionNumber ?? ""} onChange={(e) => setSection({ ...section, sectionNumber: e.target.value })} />
              </label>
            </div>
            <div className="field-row">
              <label htmlFor="section-track">
                Track (المسار)
                <input id="section-track" value={section.track ?? ""} onChange={(e) => setSection({ ...section, track: e.target.value })} />
              </label>
              <label htmlFor="section-dept">
                Department (القسم)
                <input id="section-dept" value={section.department ?? ""} onChange={(e) => setSection({ ...section, department: e.target.value })} />
              </label>
            </div>
            <div className="field-row">
              <label htmlFor="section-students">
                Enrollment
                <input id="section-students" type="number" value={section.students} aria-invalid={errors.some((e) => e.field === "section-students")} onChange={(e) => setSection({ ...section, students: Number(e.target.value) })} />
                <FieldError id="section-students" message={errors.find((e) => e.field === "section-students")?.message} />
              </label>
              <label htmlFor="section-courses">
                Course codes
                <input id="section-courses" value={section.courseCodes.join(", ")} onChange={(e) => setSection({ ...section, courseCodes: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} />
              </label>
            </div>
            <div className="toolbar">
              <Button onClick={saveSection}>
                <Save /> Save section
              </Button>
              <Button className="ghost" onClick={() => setSection(null)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

/* ----------------------------------------------------------------- Rooms */

export function Rooms() {
  const { data, setData, setToast } = useApp();
  const [editing, setEditing] = useState<Room | null>(null);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [showGrid, setShowGrid] = useState<string | null>(null);
  if (!data) return <Loading />;

  const save = () => {
    if (!editing) return;
    const found: FormError[] = [];
    if (!editing.id.trim()) found.push({ field: "room-id", message: "Room identifier is required." });
    if (editing.capacity !== null && (!Number.isFinite(editing.capacity) || editing.capacity <= 0)) {
      found.push({ field: "room-capacity", message: "Capacity must be a positive number, or left blank for unknown." });
    }
    setErrors(found);
    if (found.length) return;
    const exists = data.rooms.some((r) => r.id === editing.id);
    setData({ ...data, rooms: exists ? data.rooms.map((r) => (r.id === editing.id ? editing : r)) : [...data.rooms, editing] });
    setToast(exists ? "Room updated" : "Room created");
    setEditing(null);
  };

  const gridRoom = data.rooms.find((r) => r.id === showGrid);

  return (
    <>
      <PageTitle title="Rooms" subtitle="Capacity, building group, imported grids, and manual colour meanings. Remote meetings never occupy a room." />
      <ErrorSummary errors={errors} />
      <Card>
        <div className="generator-bar">
          <p>
            <b>{data.rooms.length}</b> rooms · <b>{data.rooms.filter((r) => r.capacity === null).length}</b> with unknown capacity
          </p>
          <Button onClick={() => setEditing({ id: "", building: "", campus: "", capacity: null, type: "Classroom", availability: [], accessible: false })}>
            <Plus /> Add room
          </Button>
        </div>
      </Card>
      <Card className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Display name</th>
              <th>Building</th>
              <th>Capacity</th>
              <th>Type</th>
              <th>In-person meetings</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.rooms.map((r) => {
              // Remote meetings are excluded: they never occupy a physical room.
              const uses = data.assignments.filter((a) => !isRemote(a) && a.roomId === r.id).length;
              return (
                <tr key={r.id}>
                  <td>
                    <b>{r.code ?? r.id}</b>
                  </td>
                  <td>{r.displayName ?? "—"}</td>
                  <td>{r.building}</td>
                  <td>{r.capacity === null ? <Badge tone="warning">Capacity unknown</Badge> : r.capacity}</td>
                  <td>{r.type}</td>
                  <td>{uses}</td>
                  <td>
                    {r.grid?.length ? (
                      <button className="table-action" aria-label={`View grid for ${r.id}`} onClick={() => setShowGrid(r.id)}>
                        <FileSpreadsheet />
                      </button>
                    ) : null}
                    <button className="table-action" aria-label={`Edit ${r.id}`} onClick={() => setEditing(r)}>
                      <Save />
                    </button>
                    <button
                      className="table-action"
                      aria-label={`Delete ${r.id}`}
                      onClick={() => {
                        if (confirm(`Delete ${r.id}?`)) {
                          setData({ ...data, rooms: data.rooms.filter((x) => x.id !== r.id) });
                          setToast("Room deleted");
                        }
                      }}
                    >
                      <Trash2 />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Dialog open={Boolean(gridRoom)} title={`Imported grid — ${gridRoom?.id ?? ""}`} onClose={() => setShowGrid(null)}>
        {gridRoom && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Period</th>
                  <th>Colour</th>
                  <th>Meaning</th>
                  <th>Text</th>
                  <th>Source cell</th>
                </tr>
              </thead>
              <tbody>
                {gridRoom.grid?.filter((cell) => cell.color || cell.text).map((cell, i) => (
                  <tr key={`${cell.day}-${cell.period}-${i}`}>
                    <td>{cell.day}</td>
                    <td>{cell.period}</td>
                    <td>
                      {cell.color ? <span className="swatch" style={{ background: cell.color.startsWith("#") ? cell.color : "transparent" }} /> : "—"} <span className="source-ref">{cell.color}</span>
                    </td>
                    <td>{cell.meaning}</td>
                    <td>{cell.text ?? "—"}</td>
                    <td className="source-ref">
                      {cell.ref.sheet}!{cell.ref.column}
                      {cell.ref.row}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Dialog>

      <Dialog open={Boolean(editing)} title="Room" onClose={() => setEditing(null)}>
        {editing && (
          <>
            <div className="field-row">
              <label htmlFor="room-id">
                Identifier
                <input id="room-id" value={editing.id} aria-invalid={errors.some((e) => e.field === "room-id")} onChange={(e) => setEditing({ ...editing, id: e.target.value })} />
                <FieldError id="room-id" message={errors.find((e) => e.field === "room-id")?.message} />
              </label>
              <label htmlFor="room-display">
                Display name
                <input id="room-display" value={editing.displayName ?? ""} onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} />
              </label>
            </div>
            <div className="field-row">
              <label htmlFor="room-building">
                Building / group
                <input id="room-building" value={editing.building} onChange={(e) => setEditing({ ...editing, building: e.target.value })} />
              </label>
              <label htmlFor="room-campus">
                Campus
                <input id="room-campus" value={editing.campus} onChange={(e) => setEditing({ ...editing, campus: e.target.value })} />
              </label>
            </div>
            <div className="field-row">
              <label htmlFor="room-capacity">
                Capacity (blank = unknown)
                <input
                  id="room-capacity"
                  type="number"
                  value={editing.capacity ?? ""}
                  aria-invalid={errors.some((e) => e.field === "room-capacity")}
                  onChange={(e) => setEditing({ ...editing, capacity: e.target.value === "" ? null : Number(e.target.value) })}
                />
                <FieldError id="room-capacity" message={errors.find((e) => e.field === "room-capacity")?.message} />
              </label>
              <label htmlFor="room-type">
                Type
                <input id="room-type" value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })} />
              </label>
            </div>
            <div className="toolbar">
              <Button onClick={save}>
                <Save /> Save room
              </Button>
              <Button className="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

/* ----------------------------------------------------------------- Rules */

export function Rules() {
  const { data, setData, setToast } = useApp();
  if (!data) return <Loading />;
  const s = data.settings;
  const set = (patch: Partial<typeof s>) => setData({ ...data, settings: { ...s, ...patch } });

  return (
    <>
      <PageTitle title="Rules & settings" subtitle="Centralized, configurable assumptions with uncertainty clearly labeled." />
      <div className="two-col">
        <Card>
          <h2>Teaching loads</h2>
          {[
            ["Professor", 10],
            ["Associate Professor", 12],
            ["Assistant Professor", 14],
            ["Lecturer", 16],
            ["Teaching Assistant", 16],
            ["Language Instructor", 18],
          ].map((x) => (
            <div className="rule-row" key={x[0]}>
              <span>{x[0]}</span>
              <b>{x[1]} units</b>
            </div>
          ))}
          <p className="footnote">
            Theory: ≥50 min = 1 unit · Practical/field: ≥100 min = 1 unit · Approved extra unit: SAR 150 potential compensation. An explicit workbook load overrides the rank default for that person.
          </p>
          <h2>Local job title → default load</h2>
          {Object.entries(s.titleLoadMap).map(([title, load]) => (
            <div className="rule-row" key={title}>
              <span>{title}</span>
              <input
                type="number"
                aria-label={`Default load for ${title}`}
                value={load}
                onChange={(e) => set({ titleLoadMap: { ...s.titleLoadMap, [title]: Number(e.target.value) } })}
              />
            </div>
          ))}
        </Card>
        <Card>
          <h2>Local settings</h2>
          <label htmlFor="setting-operator">
            Operator / author name (no authentication; this is a recorded label, not a verified identity)
            <input id="setting-operator" value={s.operatorName} onChange={(e) => set({ operatorName: e.target.value })} />
          </label>
          <label htmlFor="setting-semester">
            Semester
            <input id="setting-semester" value={s.semester} onChange={(e) => set({ semester: e.target.value })} />
          </label>
          <label htmlFor="setting-hours">
            Total weekly work
            <input id="setting-hours" type="number" min="35" max="40" value={s.totalWorkHours} onChange={(e) => set({ totalWorkHours: Number(e.target.value) })} />
          </label>
          <label htmlFor="setting-timeout">
            Generation timeout (ms)
            <input id="setting-timeout" type="number" min="500" value={s.timeoutMs} onChange={(e) => set({ timeoutMs: Number(e.target.value) })} />
          </label>
          <label htmlFor="setting-ceiling">
            Overtime ceiling
            <input id="setting-ceiling" placeholder="No confirmed limit" value={s.overtimeCeiling ?? ""} onChange={(e) => set({ overtimeCeiling: e.target.value ? Number(e.target.value) : null })} />
          </label>
          <Button onClick={() => setToast("Settings saved locally")}>
            <Save />
            Save settings
          </Button>
        </Card>
      </div>

      <Card>
        <h2>Departmental rules for 1448</h2>
        <div className="field-row">
          <label htmlFor="setting-thursday-inperson">
            In-person Thursday penalty
            <input id="setting-thursday-inperson" type="number" value={s.thursdayInPersonPenalty} onChange={(e) => set({ thursdayInPersonPenalty: Number(e.target.value) })} />
          </label>
          <label htmlFor="setting-thursday-remote">
            Remote Thursday penalty
            <input id="setting-thursday-remote" type="number" value={s.thursdayRemotePenalty} onChange={(e) => set({ thursdayRemotePenalty: Number(e.target.value) })} />
          </label>
        </div>
        <div className="field-row">
          <label htmlFor="setting-prep-min">
            Preparatory minimum in-person periods
            <input id="setting-prep-min" type="number" value={s.preparatoryMinPeriods} onChange={(e) => set({ preparatoryMinPeriods: Number(e.target.value) })} />
          </label>
          <label htmlFor="setting-prep-max">
            Preparatory maximum in-person periods
            <input id="setting-prep-max" type="number" value={s.preparatoryMaxPeriods} onChange={(e) => set({ preparatoryMaxPeriods: Number(e.target.value) })} />
          </label>
        </div>
        <p className="footnote">
          {REMOTE_ACTIVITY} is delivered عن بُعد, never receives a room, and is excluded from preparatory in-person hours. It still counts toward faculty load, appears in every schedule, and creates faculty and section conflicts.
        </p>
      </Card>

      <PeriodClockSettings />
      <TravelSettings />

      <Card>
        <h2>Program presets</h2>
        {s.programs.map((p) => (
          <div className="program-row" key={p.name}>
            <div>
              <b>{p.name}</b>
              <span>
                {p.credits ? `${p.credits} credit hours` : "Historical option"} · {p.status}
              </span>
            </div>
            <input
              type="checkbox"
              checked={p.enabled}
              aria-label={`Enable ${p.name}`}
              onChange={(e) => set({ programs: s.programs.map((x) => (x.name === p.name ? { ...x, enabled: e.target.checked } : x)) })}
            />
          </div>
        ))}
      </Card>
      <Card>
        <h2>Institutional references</h2>
        <div className="links">
          <a href="https://uqu.edu.sa/App/Regulations/1484" target="_blank" rel="noreferrer">
            UQU regulations
          </a>
          <a href="https://uqu.edu.sa/english" target="_blank" rel="noreferrer">
            English Department
          </a>
          <a href="https://uqu.edu.sa/App/Degrees?dept=1&faculty=7" target="_blank" rel="noreferrer">
            Public degrees
          </a>
          <a href="https://uqu.edu.sa/en/gs/46884" target="_blank" rel="noreferrer">
            Historical graduate page
          </a>
          <a href="https://uqu.edu.sa/gs/152448" target="_blank" rel="noreferrer">
            1448 graduate programs
          </a>
        </div>
        <p className="footnote">Department-specific and historical information is unconfirmed. Confirm internal policies and current master’s-program status before use.</p>
      </Card>
    </>
  );
}

/** Period-to-clock-time configuration. Calendar export waits on this. */
export function PeriodClockSettings() {
  const { data, setData, setToast } = useApp();
  if (!data) return null;
  const s = data.settings;
  const complete = clockTimesComplete(s);

  return (
    <Card>
      <div className="card-head">
        <div>
          <h2>Period clock times</h2>
          <p>Until every period is confirmed, the app shows الفترة 1 through الفترة 12 and calendar export stays disabled.</p>
        </div>
        <Badge tone={complete ? "success" : "warning"}>{complete ? "All periods confirmed" : `${s.periods.filter((p) => !p.confirmed).length} unconfirmed`}</Badge>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Start</th>
              <th>End</th>
              <th>Confirmed</th>
            </tr>
          </thead>
          <tbody>
            {s.periods.map((slot) => (
              <tr key={slot.period}>
                <td>الفترة {slot.period}</td>
                <td>
                  <input
                    type="time"
                    aria-label={`Start of period ${slot.period}`}
                    value={slot.start}
                    onChange={(e) => setData({ ...data, settings: { ...s, periods: s.periods.map((p) => (p.period === slot.period ? { ...p, start: e.target.value } : p)) } })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    aria-label={`End of period ${slot.period}`}
                    value={slot.end}
                    onChange={(e) => setData({ ...data, settings: { ...s, periods: s.periods.map((p) => (p.period === slot.period ? { ...p, end: e.target.value } : p)) } })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Confirm period ${slot.period}`}
                    checked={slot.confirmed}
                    onChange={(e) => setData({ ...data, settings: { ...s, periods: s.periods.map((p) => (p.period === slot.period ? { ...p, confirmed: e.target.checked } : p)) } })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <Button
          onClick={() => {
            setData({ ...data, settings: { ...s, periods: s.periods.map((p) => ({ ...p, confirmed: true })) } });
            setToast("All period clock times confirmed. Calendar export is now available.");
          }}
        >
          <CheckCircle2 /> Confirm all periods
        </Button>
        <Button
          className="ghost"
          onClick={() => {
            setData({ ...data, settings: { ...s, periods: defaultPeriodTable() } });
            setToast("Period table reset to unconfirmed nominal times");
          }}
        >
          <RotateCcw /> Reset to nominal
        </Button>
      </div>
    </Card>
  );
}

/** Building and campus transition rules. */
export function TravelSettings() {
  const { data, setData, setToast } = useApp();
  const [draft, setDraft] = useState({ fromBuilding: "", toBuilding: "", minutes: 15, hard: false, scope: "building" as "building" | "campus" });
  if (!data) return null;

  return (
    <Card>
      <div className="card-head">
        <div>
          <h2>Building transition time</h2>
          <p>Consecutive meetings in distant buildings need enough time to move between them.</p>
        </div>
      </div>
      <div className="field-row">
        <label htmlFor="travel-min-break">
          Minimum break between buildings (minutes)
          <input id="travel-min-break" type="number" value={data.settings.minBreakMinutes} onChange={(e) => setData({ ...data, settings: { ...data.settings, minBreakMinutes: Number(e.target.value) } })} />
        </label>
        <label className="toggle" htmlFor="travel-remote">
          <input id="travel-remote" type="checkbox" checked={data.settings.remoteTravelCounts} onChange={(e) => setData({ ...data, settings: { ...data.settings, remoteTravelCounts: e.target.checked } })} />
          <span>Remote meetings take part in travel-time checks</span>
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Scope</th>
              <th>From</th>
              <th>To</th>
              <th>Minutes</th>
              <th>Hard</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.travelRules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.scope}</td>
                <td>{rule.fromBuilding}</td>
                <td>{rule.toBuilding}</td>
                <td>{rule.minutes}</td>
                <td>{rule.hard ? "Hard constraint" : "Warning"}</td>
                <td>
                  <button
                    className="table-action"
                    aria-label={`Delete rule ${rule.id}`}
                    onClick={() => {
                      setData({ ...data, travelRules: data.travelRules.filter((r) => r.id !== rule.id) });
                      setToast("Travel rule removed");
                    }}
                  >
                    <Trash2 />
                  </button>
                </td>
              </tr>
            ))}
            {!data.travelRules.length && (
              <tr>
                <td colSpan={6}>
                  <Empty text="No travel rules yet. Add one below." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="field-row">
        <label htmlFor="travel-from">
          From
          <input id="travel-from" value={draft.fromBuilding} onChange={(e) => setDraft({ ...draft, fromBuilding: e.target.value })} />
        </label>
        <label htmlFor="travel-to">
          To
          <input id="travel-to" value={draft.toBuilding} onChange={(e) => setDraft({ ...draft, toBuilding: e.target.value })} />
        </label>
      </div>
      <div className="field-row">
        <label htmlFor="travel-minutes">
          Minutes
          <input id="travel-minutes" type="number" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })} />
        </label>
        <label htmlFor="travel-scope">
          Scope
          <select id="travel-scope" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as "building" | "campus" })}>
            <option value="building">Building to building</option>
            <option value="campus">Campus to campus</option>
          </select>
        </label>
      </div>
      <label className="toggle" htmlFor="travel-hard">
        <input id="travel-hard" type="checkbox" checked={draft.hard} onChange={(e) => setDraft({ ...draft, hard: e.target.checked })} />
        <span>Treat as a hard constraint rather than a warning</span>
      </label>
      <Button
        onClick={() => {
          if (!draft.fromBuilding.trim() || !draft.toBuilding.trim()) {
            setToast("Enter both buildings before adding a rule");
            return;
          }
          setData({ ...data, travelRules: [...data.travelRules, { ...draft, id: crypto.randomUUID() }] });
          setDraft({ fromBuilding: "", toBuilding: "", minutes: 15, hard: false, scope: "building" });
          setToast("Travel rule added");
        }}
      >
        <Plus /> Add travel rule
      </Button>
    </Card>
  );
}

/* -------------------------------------------------------------- Versions */

export function Versions() {
  const { data, setData, setToast, snapshots, rollback } = useApp();
  const [name, setName] = useState("");
  if (!data) return <Loading />;

  const save = () => {
    if (!name.trim()) {
      setToast("Enter a version name");
      return;
    }
    const version: ScheduleVersion = {
      id: crypto.randomUUID(),
      name: name.trim(),
      date: new Date().toISOString(),
      author: data.settings.operatorName,
      operator: data.settings.operatorName,
      summary: "Manual schedule snapshot",
      conflicts: allConflicts(data).length,
      score: Math.max(0, 100 - allConflicts(data).length * 8),
      status: "draft",
      state: data.scheduleState,
      assignments: structuredClone(data.assignments),
    };
    setData({ ...data, versions: [version, ...data.versions] });
    setName("");
    setToast("Version saved");
  };

  return (
    <>
      <PageTitle title="Versions" subtitle="Named, restorable schedule snapshots kept on this device." />
      <Card>
        <div className="toolbar">
          <label>
            Version name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Week 1 review" />
          </label>
          <Button onClick={save}>
            <Save />
            Save snapshot
          </Button>
          <Link className="button ghost" href="/compare">
            Compare two versions
          </Link>
        </div>
      </Card>
      <div className="stack">
        {data.versions.map((v) => (
          <Card key={v.id}>
            <div className="version-row">
              <div>
                <h2>{v.name}</h2>
                <p>
                  {new Date(v.date).toLocaleString()} · {v.author} · {v.summary}
                  {v.reason ? ` · reason: ${v.reason}` : ""}
                </p>
              </div>
              <div className="toolbar">
                <Badge tone={v.state === "approved" ? "success" : v.state === "superseded" ? "danger" : "neutral"}>{v.state ?? v.status}</Badge>
                <Badge>{v.assignments.length} meetings</Badge>
                <Button
                  className="secondary"
                  onClick={() => {
                    if (confirm(`Restore ${v.name}? A backup of the current schedule will be created first.`)) {
                      const backup: ScheduleVersion = { ...v, id: crypto.randomUUID(), name: "Backup before restore", date: new Date().toISOString(), assignments: data.assignments };
                      setData({ ...data, versions: [backup, ...data.versions], assignments: structuredClone(v.assignments) });
                      setToast("Version restored");
                    }
                  }}
                >
                  <RefreshCw />
                  Restore
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {!data.versions.length && <Empty text="No snapshots yet. Save the current schedule above." />}
      </div>
      <Card>
        <h2>Rollback snapshots</h2>
        <p>Automatic copies taken before each import, bulk edit, and regeneration.</p>
        <div className="stack">
          {snapshots.map((snapshot) => (
            <div className="version-row" key={snapshot.id}>
              <div>
                <b>{snapshot.label}</b>
                <p>
                  {new Date(snapshot.at).toLocaleString()} · {snapshot.data.assignments.length} meetings
                </p>
              </div>
              <Button
                className="ghost"
                onClick={() => {
                  if (confirm(`Roll back to "${snapshot.label}"? The current schedule will be replaced.`)) void rollback(snapshot.id);
                }}
              >
                <RotateCcw /> Roll back
              </Button>
            </div>
          ))}
          {!snapshots.length && <Empty text="No rollback snapshots yet." />}
        </div>
      </Card>
    </>
  );
}

/* ---------------------------------------------------------- Generic import */

type SheetPreview = { name: string; rows: number; headers: string[]; sample: Record<string, string>[] };

const TARGET_FIELDS: Record<string, string[]> = {
  Faculty: ["id", "nameEn", "nameAr", "rank", "specialization", "campus"],
  Courses: ["code", "nameEn", "nameAr", "program", "level", "creditHours", "teachingType", "specialization", "meetingsPerWeek", "duration", "roomType"],
  Sections: ["id", "program", "level", "students", "campus", "courseCodes", "sharedGroups"],
  Rooms: ["id", "building", "campus", "capacity", "type", "accessible"],
};

export function ImportPage() {
  const { data, setDataWithSnapshot, setToast, reset } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SheetPreview[]>([]);
  const [target, setTarget] = useState<keyof typeof TARGET_FIELDS>("Faculty");
  const [sheet, setSheet] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [allowPartial, setAllowPartial] = useState(false);
  const [errors, setErrors] = useState<FormError[]>([]);
  const input = useRef<HTMLInputElement>(null);
  if (!data) return <Loading />;

  const read = async (f: File) => {
    setFile(f);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const sheets: SheetPreview[] = wb.SheetNames.map((name) => {
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[name], { defval: "" });
        return { name, rows: json.length, headers: Object.keys(json[0] ?? {}), sample: json.slice(0, 5) };
      });
      setPreview(sheets);
      setSheet(sheets[0]?.name ?? "");
      setMapping({});
      setToast("Workbook parsed. Review sheets and map columns before importing.");
    } catch {
      setToast("Could not read this workbook");
    }
  };

  const activeSheet = preview.find((s) => s.name === sheet);

  const commit = async () => {
    if (!file || !activeSheet) return;
    const fields = TARGET_FIELDS[target];
    const missing = fields.filter((f) => !mapping[f]);
    if (missing.length && !allowPartial) {
      setErrors(missing.map((f) => ({ field: `map-${f}`, message: `Column for "${f}" is not mapped. Map it, or confirm a valid-rows-only import.` })));
      return;
    }
    setErrors([]);
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[activeSheet.name], { defval: "" });
    const valid: Record<string, string>[] = [];
    const skipped: { row: number; reason: string }[] = [];
    json.forEach((row, index) => {
      const mapped: Record<string, string> = {};
      const blanks: string[] = [];
      for (const field of fields) {
        const column = mapping[field];
        const value = column ? String(row[column] ?? "").trim() : "";
        if (!value) blanks.push(field);
        mapped[field] = value;
      }
      if (blanks.length) {
        skipped.push({ row: index + 2, reason: `Missing ${blanks.join(", ")}` });
        if (!allowPartial) return;
      }
      valid.push(mapped);
    });

    if (skipped.length && !allowPartial) {
      setErrors([
        {
          field: "import-partial",
          message: `${skipped.length} row(s) are incomplete and would be skipped: rows ${skipped.slice(0, 5).map((s) => s.row).join(", ")}${skipped.length > 5 ? "…" : ""}. Tick "import valid rows only" to continue.`,
        },
      ]);
      return;
    }

    const next = { ...data };
    if (target === "Faculty") {
      next.faculty = [...data.faculty, ...valid.map((r) => ({ ...BLANK_FACULTY(r.id || `F-${crypto.randomUUID().slice(0, 6)}`), ...r, normalLimit: 16 }) as Faculty)];
    } else if (target === "Rooms") {
      next.rooms = [...data.rooms, ...valid.map((r) => ({ id: r.id, building: r.building, campus: r.campus, capacity: r.capacity ? Number(r.capacity) : null, type: r.type || "Classroom", availability: [], accessible: r.accessible === "true" }) as Room)];
    } else if (target === "Courses") {
      next.courses = [...data.courses, ...valid.map((r) => ({ code: r.code, nameEn: r.nameEn, nameAr: r.nameAr, program: r.program, level: Number(r.level) || 1, creditHours: Number(r.creditHours) || 0, teachingType: (r.teachingType as Course["teachingType"]) || "theoretical", specialization: r.specialization, meetingsPerWeek: Number(r.meetingsPerWeek) || 1, duration: Number(r.duration) || 50, roomType: r.roomType || "Classroom" }) as Course)];
    } else {
      next.sections = [...data.sections, ...valid.map((r) => ({ id: r.id, program: r.program, level: Number(r.level) || 1, students: Number(r.students) || 0, campus: r.campus, courseCodes: (r.courseCodes || "").split(/[;,]/).map((v) => v.trim()).filter(Boolean), sharedGroups: (r.sharedGroups || "").split(/[;,]/).map((v) => v.trim()).filter(Boolean) }) as Section)];
    }

    await setDataWithSnapshot(`Generic import of ${valid.length} ${target} rows`, next);
    setToast(
      skipped.length
        ? `Imported ${valid.length} row(s); ${skipped.length} incomplete row(s) were reported and not silently discarded.`
        : `Imported ${valid.length} row(s) into ${target}.`,
    );
  };

  const template = () => {
    const wb = XLSX.utils.book_new();
    for (const [name, heads] of Object.entries({ ...TARGET_FIELDS, Availability: ["entityId", "day", "start", "end", "kind"], Constraints: ["key", "value", "notes"] })) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([heads]), name);
    }
    XLSX.writeFile(wb, "UQU-Schedule-Import-Template.xlsx");
  };

  return (
    <>
      <PageTitle title="Data import" subtitle="Generic Excel/CSV workflow with column mapping. Invalid rows are never silently discarded." />
      <div className="notice">
        <AlertTriangle />
        <span>
          Importing the department&apos;s 1448 workbooks? Use the dedicated <Link href="/import-1448">UQU 1448 importer</Link> instead — it understands the Arabic headers, activity rules, and room colour grids.
        </span>
      </div>
      <ErrorSummary errors={errors} />
      <Card>
        <div
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void read(f);
          }}
        >
          <FileSpreadsheet />
          <h2>Drop Excel or CSV here</h2>
          <p>or select a file for workbook preview, column mapping, and validation</p>
          <Button onClick={() => input.current?.click()}>Choose file</Button>
          <input
            ref={input}
            hidden
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void read(f);
            }}
          />
        </div>
        <p className="footnote">Files are parsed in this browser. Nothing is uploaded to any external service.</p>
      </Card>

      {file && (
        <Card>
          <h2>{file.name}</h2>
          <div className="sheet-list">
            {preview.map((s) => (
              <div key={s.name}>
                <CheckCircle2 />
                <span>{s.name}</span>
                <b>{s.rows} rows</b>
              </div>
            ))}
          </div>
          <div className="filter-bar">
            <label>
              Sheet
              <select value={sheet} onChange={(e) => setSheet(e.target.value)}>
                {preview.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </select>
            </label>
            <label>
              Import into
              <select value={target} onChange={(e) => setTarget(e.target.value as keyof typeof TARGET_FIELDS)}>
                {Object.keys(TARGET_FIELDS).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <h2>Column mapping</h2>
          {TARGET_FIELDS[target].map((field) => (
            <div className="rule-row" key={field}>
              <span>{field}</span>
              <select id={`map-${field}`} aria-label={`Column for ${field}`} value={mapping[field] ?? ""} onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}>
                <option value="">Not mapped</option>
                {activeSheet?.headers.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
          <label className="toggle" htmlFor="import-partial">
            <input id="import-partial" type="checkbox" checked={allowPartial} onChange={(e) => setAllowPartial(e.target.checked)} />
            <span>Import valid rows only, and report every skipped row</span>
          </label>
          <Button onClick={() => void commit()}>Import mapped rows</Button>
        </Card>
      )}

      <Card>
        <div className="generator-bar">
          <div>
            <h2>Safe data tools</h2>
            <p>Template export and confirmed fictional reset</p>
          </div>
          <div className="toolbar">
            <Button className="secondary" onClick={template}>
              <Download />
              Download .xlsx template
            </Button>
            <Button
              className="danger"
              onClick={() => {
                if (confirm("Reset all local records, schedules, versions, and edits to the fictional demo dataset?")) reset();
              }}
            >
              <Trash2 />
              Reset demo data
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}

/* --------------------------------------------------------------- Reports */

export function Reports() {
  const { data, setToast, locale } = useApp();
  if (!data) return <Loading />;

  const exportWorkbook = () => {
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: unknown[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name);
    add(
      "Schedule",
      data.assignments.map((a) => ({
        id: a.id,
        course: a.courseCode,
        activity: a.activity ?? "",
        section: a.sectionId,
        faculty: a.facultyId,
        day: a.day,
        time: timeLabel(data, a, locale),
        room: roomLabel(a, locale),
        delivery: isRemote(a) ? "عن بُعد" : "in-person",
        version: data.versions[0]?.name || "Current",
        exportDate: new Date().toISOString(),
      })),
    );
    add("Faculty Load", data.faculty.map((f) => ({ id: f.id, nameEn: f.nameEn, ...loadSummary(f, data.assignments, data.settings) })));
    add("Conflicts", allConflicts(data));
    add("Faculty", data.faculty.map((f) => ({ ...f, available: f.available.map((p) => p.day).join(";"), unavailable: "", preferred: "", preferredDays: f.preferredDays.join(";") })));
    add("Courses", data.courses);
    add("Sections", data.sections.map((s) => ({ ...s, courseCodes: s.courseCodes.join(";"), sharedGroups: s.sharedGroups.join(";"), collegeIds: (s.collegeIds ?? []).join(";") })));
    add("Rooms", data.rooms.map((r) => ({ id: r.id, building: r.building, campus: r.campus, capacity: r.capacity ?? "unknown", type: r.type })));
    XLSX.writeFile(wb, `UQU-Schedule-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setToast("Excel report exported");
  };

  const reports = [
    ["Department schedule", "/editor"],
    ["Per-faculty schedules", "/faculty-schedule"],
    ["Per-section schedules", "/courses"],
    ["Per-room schedules", "/rooms"],
    ["Faculty load & fairness", "/fairness"],
    ["Overtime & approval", "/fairness"],
    ["Data quality report", "/quality"],
    ["Unscheduled meetings", "/unscheduled"],
    ["College exports", "/colleges"],
    ["Distribution log", "/distribution"],
    ["Version comparison", "/compare"],
    ["Calendar (ICS)", "/colleges"],
  ] as const;

  return (
    <>
      <PageTitle title="Reports & exports" subtitle="Current source data, calculated loads, conflicts, and printable perspectives." />
      <div className="report-grid">
        {reports.map(([label, href]) => (
          <Card key={label}>
            <FileSpreadsheet />
            <h2>{label}</h2>
            <p>
              <Link href={href}>Open</Link>
            </p>
          </Card>
        ))}
      </div>
      <Card>
        <div className="toolbar">
          <Button onClick={exportWorkbook}>
            <Download />
            Export multi-sheet Excel
          </Button>
          <Button
            className="secondary"
            onClick={() => {
              const report = runQualityChecks(data);
              downloadBlob(`UQU-validation-${new Date().toISOString().slice(0, 10)}.txt`, `Errors ${report.counts.error}, warnings ${report.counts.warning}`, "text/plain;charset=utf-8");
              setToast("Validation summary exported");
            }}
          >
            <Download />
            Export validation summary
          </Button>
          <Button className="secondary" onClick={() => window.print()}>
            <Printer />
            Open print view
          </Button>
        </div>
      </Card>
    </>
  );
}

export { Loading, Empty };
