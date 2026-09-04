"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, Copy, Download, FlaskConical, Printer, Search, Trash2 } from "lucide-react";
import { useApp } from "../app-provider";
import { Badge, Button, Card, Empty, ErrorSummary, Loading, PageTitle, Stat, downloadBlob, type FormError } from "../ui-kit";
import { timeLabel } from "./core";
import { loadSummary } from "@/lib/rules";
import { isRemote, roomLabel, travelConflicts } from "@/lib/schedule-rules";
import { buildIcs, icsGate } from "@/lib/ics";
import { buildWorkbook } from "@/lib/xlsx-writer";
import { safeFilename } from "@/lib/zip";
import { DEFAULT_INDEX_WEIGHTS, INDEX_FORMULA, distributionIndex, fairnessReport, type IndexWeights } from "@/lib/fairness";
import { cloneIntoScenario, discardScenario, promoteScenario, scenarioMetrics } from "@/lib/scenarios";
import { CHANGE_ICONS, CHANGE_LABELS, diffSchedules, filterDiff, type ChangeType } from "@/lib/diff";
import { DEFAULT_CLONE_OPTIONS, cloneReview, cloneSemester, type CloneOptions } from "@/lib/clone";
import { collegeName, collegesForAssignment } from "@/lib/colleges";
import type { Assignment } from "@/lib/types";

/* ---------------------------------------------- Individual faculty view */

export function FacultySchedulePage() {
  const { data, locale, setToast } = useApp();
  const [query, setQuery] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [errors, setErrors] = useState<FormError[]>([]);

  useEffect(() => {
    // Deep-linked from the Data Quality Center and the dashboard.
    queueMicrotask(() => {
      const id = new URLSearchParams(window.location.search).get("faculty");
      if (id) setFacultyId(id);
    });
  }, []);

  if (!data) return <Loading />;

  const matches = data.faculty.filter((f) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${f.id} ${f.nameAr} ${f.nameEn} ${f.jobTitleAr ?? ""}`.toLowerCase().includes(q);
  });
  const person = data.faculty.find((f) => f.id === facultyId);
  const own = person ? data.assignments.filter((a) => a.facultyId === person.id) : [];
  const summary = person ? loadSummary(person, data.assignments, data.settings) : null;
  const calendar = icsGate(data);

  const exportExcel = () => {
    if (!person) return;
    const rows = [
      ["المقرر", "النشاط", "الشعبة", "الكلية", "اليوم", "الفترة / الوقت", "القاعة"],
      ...own.map((a) => [
        a.courseCode,
        a.activity ?? "",
        a.sectionId,
        collegesForAssignment(data, a).map((id) => collegeName(data.colleges, id, "ar")).join("، "),
        a.day,
        timeLabel(data, a, locale),
        roomLabel(a, "ar"),
      ]),
    ];
    const loadRows = [
      ["البند", "القيمة"],
      ["العبء النظامي", summary?.limit ?? 0],
      ["الوحدات المسندة", summary?.assigned ?? 0],
      ["انتظام", summary?.regular ?? 0],
      ["تأهيلي", summary?.preparatory ?? 0],
      ["اضافية (برنامج إضافي، وليست ساعات إضافية معتمدة)", summary?.additional ?? 0],
      ["حضوري", summary?.inPersonUnits ?? 0],
      ["عن بُعد", summary?.remoteUnits ?? 0],
      ["الساعات الإضافية", summary?.overtime ?? 0],
    ];
    const bytes = buildWorkbook({
      rtl: true,
      title: person.nameAr || person.nameEn,
      creator: data.settings.operatorName,
      sheets: [
        { name: "الجدول", rows, columnWidths: [14, 12, 16, 26, 12, 22, 16], freezeHeader: true, filter: true, printArea: true },
        { name: "العبء", rows: loadRows, columnWidths: [46, 14], freezeHeader: true, printArea: true },
      ],
    });
    downloadBlob(`${safeFilename(`جدول ${person.nameAr || person.nameEn} ${data.settings.semester}`)}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    setToast("Individual schedule exported");
  };

  const exportIcs = () => {
    if (!person) return;
    if (!calendar.allowed) {
      setErrors([{ field: "faculty-picker", message: calendar.reason }]);
      return;
    }
    setErrors([]);
    downloadBlob(`${safeFilename(person.id)}.ics`, buildIcs(data, own, { versionId: data.approvedVersionId ?? "draft", locale }), "text/calendar;charset=utf-8");
    setToast("Calendar file exported");
  };

  return (
    <>
      <PageTitle title="Individual faculty schedule" subtitle="One person's weekly timetable, load summary, and exports." />
      <ErrorSummary errors={errors} />
      <Card>
        <div className="toolbar">
          <label className="search">
            <Search />
            <span className="sr-only">Search faculty</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by Arabic name, English name, or ID…" />
          </label>
          <label>
            <span className="sr-only">Select faculty member</span>
            <select id="faculty-picker" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} aria-label="Faculty member">
              <option value="">Choose a faculty member…</option>
              {matches.map((f) => (
                <option key={f.id} value={f.id}>
                  {locale === "ar" ? f.nameAr : f.nameEn} · {f.id}
                </option>
              ))}
            </select>
          </label>
          <Button className="ghost" onClick={() => window.print()} disabled={!person}>
            <Printer /> Print
          </Button>
          <Button className="secondary" onClick={exportExcel} disabled={!person}>
            <Download /> Excel
          </Button>
          <Button className="ghost" onClick={() => window.print()} disabled={!person}>
            <Download /> PDF layout
          </Button>
          <Button className="ghost" onClick={exportIcs} disabled={!person || !calendar.allowed}>
            <CalendarDays /> ICS
          </Button>
        </div>
        {!calendar.allowed && <p className="footnote">{calendar.reason}</p>}
      </Card>

      {!person ? (
        <Empty text="Search for a faculty member above to open their weekly timetable." />
      ) : (
        <>
          <Card>
            <div className="card-head">
              <div>
                <h2>{locale === "ar" ? person.nameAr : person.nameEn}</h2>
                <p>
                  {person.jobTitleAr || person.rank}
                  {person.affiliation ? ` · ${person.affiliation}` : ""} · {person.id}
                </p>
              </div>
              {summary?.explicitLoads && <Badge tone="success">workbook load values</Badge>}
            </div>
            <div className="stat-row">
              <Stat label="Regular (انتظام)" value={summary?.regular ?? 0} />
              <Stat label="Preparatory (تأهيلي)" value={summary?.preparatory ?? 0} />
              <Stat label="Additional program (اضافية)" value={summary?.additional ?? 0} />
              <Stat label="Assigned units" value={summary?.assigned ?? 0} />
              <Stat label="Normal / effective load" value={summary?.limit ?? 0} />
              <Stat label="Overtime" value={summary?.overtime ?? 0} tone={(summary?.overtime ?? 0) > 0 ? "warning" : "success"} />
              <Stat label="In person" value={summary?.inPersonUnits ?? 0} />
              <Stat label="Remote (عن بُعد)" value={summary?.remoteUnits ?? 0} />
            </div>
            <p className="footnote">
              اضافية is preserved as a separate additional-program category, not as approved overtime. Overtime is calculated independently from the applicable normal or reduced load.
            </p>
          </Card>

          <Card className="table-wrap">
            <h2>Weekly timetable</h2>
            <WeeklyGrid assignments={own} />
          </Card>

          <Card className="table-wrap">
            <h2>Meetings</h2>
            <table>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Activity</th>
                  <th>Section</th>
                  <th>College</th>
                  <th>Day</th>
                  <th>Period / time</th>
                  <th>Room</th>
                </tr>
              </thead>
              <tbody>
                {own.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <b>{a.courseCode}</b>
                    </td>
                    <td>{a.activity ?? "—"}</td>
                    <td>{a.sectionId}</td>
                    <td>{collegesForAssignment(data, a).map((id) => collegeName(data.colleges, id, locale)).join(", ") || "—"}</td>
                    <td>{a.day}</td>
                    <td>{timeLabel(data, a, locale)}</td>
                    <td>{isRemote(a) ? <Badge tone="warning">عن بُعد</Badge> : (a.roomId ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!own.length && <Empty text="This faculty member has no scheduled meetings." />}
          </Card>
        </>
      )}
    </>
  );
}

/** Day × period grid used by the individual schedule view. */
function WeeklyGrid({ assignments }: { assignments: Assignment[] }) {
  const { data, locale } = useApp();
  if (!data) return null;
  const periods = data.settings.periods;
  return (
    <table className="timetable">
      <thead>
        <tr>
          <th>Period</th>
          {data.settings.days.map((day) => (
            <th key={day}>{day}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {periods.map((slot) => (
          <tr key={slot.period}>
            <th scope="row">
              الفترة {slot.period}
              {slot.confirmed && (
                <small>
                  {slot.start}–{slot.end}
                </small>
              )}
            </th>
            {data.settings.days.map((day) => {
              const here = assignments.filter((a) => a.day === day && (a.periods ?? []).includes(slot.period));
              return (
                <td key={day}>
                  {here.map((a) => (
                    <span className={`slot${isRemote(a) ? " remote" : ""}`} key={a.id}>
                      <b>{a.courseCode}</b> {a.activity ?? ""}
                      <br />
                      {a.sectionId} · {roomLabel(a, locale)}
                    </span>
                  ))}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------ Fairness report */

export function FairnessPage() {
  const { data } = useApp();
  const [weights, setWeights] = useState<IndexWeights>(DEFAULT_INDEX_WEIGHTS);
  const [showIndex, setShowIndex] = useState(false);
  if (!data) return <Loading />;
  const report = fairnessReport(data);

  return (
    <>
      <PageTitle title="Workload distribution" subtitle="Decision support, not an employment judgement. Every figure is shown with the values behind it." />
      <div className="notice">
        <AlertTriangle />
        <span>
          This report describes how teaching is distributed. It does not label anyone as unfair or underperforming, and it is not an official employment judgement.
        </span>
      </div>
      <div className="stat-row">
        <Stat label="In-person Thursday meetings" value={report.totals.thursdayInPerson} tone={report.totals.thursdayInPerson ? "warning" : "success"} />
        <Stat label="Remote meetings (عن بُعد)" value={report.totals.remoteMeetings} />
        <Stat label="Total overtime units" value={report.totals.overtimeUnits} />
      </div>

      <Card>
        <div className="card-head">
          <div>
            <h2>Optional summary index</h2>
            <p>Off by default. When shown, the formula and its weights are published alongside the values.</p>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={showIndex} onChange={(e) => setShowIndex(e.target.checked)} />
            <span>Show the index column</span>
          </label>
        </div>
        {showIndex && (
          <>
            <p className="source-ref">{INDEX_FORMULA}</p>
            <div className="filter-bar">
              {(Object.keys(weights) as (keyof IndexWeights)[]).map((key) => (
                <label key={key}>
                  {key}
                  <input type="number" step="0.25" value={weights[key]} onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })} />
                </label>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Faculty</th>
              <th>Normal</th>
              <th>Reduced</th>
              <th>Effective</th>
              <th>Assigned</th>
              <th>Regular</th>
              <th>Prep</th>
              <th>Additional</th>
              <th>In person</th>
              <th>Remote</th>
              <th>Overtime</th>
              <th>Days</th>
              <th>Thursday</th>
              <th>Early</th>
              <th>Late</th>
              <th>Gaps</th>
              <th>Max consecutive</th>
              <th>Transitions</th>
              {showIndex && <th>Index</th>}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.facultyId}>
                <td>
                  <b>{row.nameAr || row.nameEn}</b>
                  <small>{row.facultyId}</small>
                  {row.explicitLoads && <Badge tone="success">workbook</Badge>}
                </td>
                <td>{row.normalLoad}</td>
                <td>{row.reducedLoad ?? "—"}</td>
                <td>{row.effectiveLoad}</td>
                <td>{row.assignedUnits}</td>
                <td>{row.regular}</td>
                <td>{row.preparatory}</td>
                <td>{row.additional}</td>
                <td>{row.inPersonUnits}</td>
                <td>{row.remoteUnits}</td>
                <td>{row.overtime}</td>
                <td>{row.teachingDays}</td>
                <td>{row.thursdayAssignments}</td>
                <td>{row.earlySessions}</td>
                <td>{row.lateSessions}</td>
                <td>{row.weeklyGaps}</td>
                <td>{row.maxConsecutive}</td>
                <td>{row.buildingTransitions}</td>
                {showIndex && <td>{distributionIndex(row, weights).toFixed(2)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2>Building transition findings</h2>
        <ul className="reason-list">
          {data.faculty.flatMap((f) => travelConflicts(data, data.assignments, f.id)).map((c) => (
            <li key={`${c.assignmentId}-${c.otherId}`}>
              <span className={`severity ${c.hard ? "error" : "warning"}`}>{c.hard ? "hard" : "warning"}</span> {c.message}
            </li>
          ))}
        </ul>
        {!data.faculty.some((f) => travelConflicts(data, data.assignments, f.id).length) && <Empty text="No travel-time conflicts detected." />}
      </Card>
    </>
  );
}

/* ------------------------------------------------------- What-if sandbox */

export function ScenariosPage() {
  const { data, setData, setDataWithSnapshot, setToast } = useApp();
  const [name, setName] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  if (!data) return <Loading />;

  const required = data.sections.reduce((n, s) => n + s.courseCodes.length, 0);
  const metrics = data.scenarios.map((s) => scenarioMetrics(data, s, required));
  const chosen = metrics.filter((m) => compare.includes(m.scenarioId)).slice(0, 3);

  return (
    <>
      <PageTitle title="What-if sandbox" subtitle="Non-destructive scenarios. The master schedule is never overwritten until a scenario is explicitly promoted." />
      <div className="scenario-banner">
        <FlaskConical aria-hidden="true" /> Scenario mode — nothing here affects the active schedule until you promote it.
      </div>
      <Card>
        <div className="toolbar">
          <label>
            Scenario name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. fewer Thursday meetings" />
          </label>
          <Button
            onClick={() => {
              const scenario = cloneIntoScenario(data, name);
              setData({ ...data, scenarios: [scenario, ...data.scenarios] });
              setName("");
              setToast(`Scenario "${scenario.name}" cloned from the current schedule.`);
            }}
          >
            <Copy /> Clone current schedule into a scenario
          </Button>
        </div>
      </Card>

      <div className="scenario-grid">
        {data.scenarios.map((scenario) => {
          const m = metrics.find((x) => x.scenarioId === scenario.id);
          return (
            <Card key={scenario.id}>
              <div className="card-head">
                <div>
                  <h2>{scenario.name}</h2>
                  <p>{new Date(scenario.createdAt).toLocaleString()}</p>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    aria-label={`Compare ${scenario.name}`}
                    checked={compare.includes(scenario.id)}
                    onChange={(e) => setCompare(e.target.checked ? [...compare, scenario.id].slice(-3) : compare.filter((x) => x !== scenario.id))}
                  />
                  <span>Compare</span>
                </label>
              </div>
              <div className="stat-row">
                <Stat label="Conflicts" value={m?.conflicts ?? 0} />
                <Stat label="Overtime" value={m?.overtimeUnits ?? 0} />
                <Stat label="Gaps" value={m?.facultyGaps ?? 0} />
                <Stat label="In-person Thursday" value={m?.thursdayInPerson ?? 0} />
                <Stat label="Remote Thursday" value={m?.thursdayRemote ?? 0} />
                <Stat label="Rooms used" value={m?.roomsUsed ?? 0} />
                <Stat label="Unscheduled" value={m?.unscheduled ?? 0} />
              </div>
              <h3>Constraint weights</h3>
              <div className="filter-bar">
                {Object.entries(scenario.weights).slice(0, 6).map(([key, value]) => (
                  <label key={key}>
                    {key}
                    <input
                      type="number"
                      value={value}
                      onChange={(e) =>
                        setData({
                          ...data,
                          scenarios: data.scenarios.map((s) => (s.id === scenario.id ? { ...s, weights: { ...s.weights, [key]: Number(e.target.value) } } : s)),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="toolbar">
                <Button
                  onClick={() => {
                    if (!confirm(`Promote "${scenario.name}" into a new draft version? The current schedule is saved as a version first.`)) return;
                    const result = promoteScenario(data, scenario.id);
                    void setDataWithSnapshot(`Before promoting scenario ${scenario.name}`, result.data);
                    setToast(result.message);
                  }}
                >
                  Promote to a new draft
                </Button>
                <Button
                  className="ghost"
                  onClick={() => {
                    setData(discardScenario(data, scenario.id));
                    setToast("Scenario discarded. The active schedule was not changed.");
                  }}
                >
                  <Trash2 /> Discard
                </Button>
              </div>
            </Card>
          );
        })}
        {!data.scenarios.length && <Empty text="No scenarios yet. Clone the current schedule above to try an alternative." />}
      </div>

      {chosen.length > 1 && (
        <Card className="table-wrap">
          <h2>Scenario comparison</h2>
          <table>
            <thead>
              <tr>
                <th>Measure</th>
                {chosen.map((m) => (
                  <th key={m.scenarioId}>{m.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["conflicts", "overtimeUnits", "facultyGaps", "thursdayInPerson", "thursdayRemote", "roomsUsed", "unscheduled", "remoteMeetings"] as const).map((key) => (
                <tr key={key}>
                  <th scope="row">{key}</th>
                  {chosen.map((m) => (
                    <td key={m.scenarioId}>{m[key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

/* -------------------------------------------------- Version comparison */

export function ComparePage() {
  const { data, locale } = useApp();
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("current");
  const [type, setType] = useState<ChangeType | "">("");
  const [facultyFilter, setFacultyFilter] = useState("");
  if (!data) return <Loading />;

  const options = [
    { id: "current", name: "Current schedule", assignments: data.assignments },
    ...data.versions.map((v) => ({ id: v.id, name: v.name, assignments: v.assignments })),
    ...data.scenarios.map((s) => ({ id: s.id, name: `Scenario: ${s.name}`, assignments: s.assignments })),
  ];
  const a = options.find((o) => o.id === left);
  const b = options.find((o) => o.id === right);
  const diff = a && b ? diffSchedules(a.assignments, b.assignments) : null;
  const rows = diff ? filterDiff(diff, { type: type || undefined, faculty: facultyFilter || undefined }) : [];

  const exportChanges = () => {
    if (!diff) return;
    const bytes = buildWorkbook({
      rtl: locale === "ar",
      title: "Version comparison",
      sheets: [
        {
          name: "التغييرات",
          rows: [
            ["المعرّف", "المقرر", "الشعبة", "نوع التغيير", "قبل", "بعد"],
            ...diff.rows.flatMap((row) => row.changes.map((c) => [row.assignmentId, row.courseCode, row.sectionId, CHANGE_LABELS[c.field].ar, c.before, c.after])),
          ],
          columnWidths: [18, 14, 20, 22, 26, 26],
          freezeHeader: true,
          filter: true,
          printArea: true,
        },
      ],
    });
    downloadBlob(`UQU-version-changes-${new Date().toISOString().slice(0, 10)}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  };

  return (
    <>
      <PageTitle title="Version comparison" subtitle="Field-level differences between two versions or scenarios, marked with text and icons as well as colour." />
      <Card>
        <div className="filter-bar">
          <label>
            Compare
            <select value={left} onChange={(e) => setLeft(e.target.value)}>
              <option value="">Choose a baseline…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            With
            <select value={right} onChange={(e) => setRight(e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Change type
            <select value={type} onChange={(e) => setType(e.target.value as ChangeType | "")}>
              <option value="">All changes</option>
              {(Object.keys(CHANGE_LABELS) as ChangeType[]).map((k) => (
                <option key={k} value={k}>
                  {CHANGE_ICONS[k]} {locale === "ar" ? CHANGE_LABELS[k].ar : CHANGE_LABELS[k].en}
                </option>
              ))}
            </select>
          </label>
          <label>
            Faculty
            <select value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value)}>
              <option value="">All faculty</option>
              {data.faculty.map((f) => (
                <option key={f.id} value={f.id}>
                  {locale === "ar" ? f.nameAr : f.nameEn}
                </option>
              ))}
            </select>
          </label>
          <Button className="ghost" onClick={() => window.print()}>
            <Printer /> Print view
          </Button>
          <Button className="secondary" onClick={exportChanges} disabled={!diff}>
            <Download /> Excel change report
          </Button>
        </div>
      </Card>

      {diff && (
        <>
          <div className="stat-row">
            {(Object.keys(CHANGE_LABELS) as ChangeType[])
              .filter((k) => diff.counts[k] > 0)
              .map((k) => (
                <Stat key={k} label={`${CHANGE_ICONS[k]} ${locale === "ar" ? CHANGE_LABELS[k].ar : CHANGE_LABELS[k].en}`} value={diff.counts[k]} />
              ))}
            {!Object.values(diff.counts).some(Boolean) && <Stat label="Differences" value={0} tone="success" />}
          </div>
          <Card className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Assignment</th>
                  <th>Course</th>
                  <th>Section</th>
                  <th>Change</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  row.changes.map((change, i) => (
                    <tr className="diff-row" key={`${row.assignmentId}-${change.field}-${i}`}>
                      <td>{row.assignmentId}</td>
                      <td>{row.courseCode}</td>
                      <td>{row.sectionId}</td>
                      <td>
                        <span className={`change-chip ${change.field}`}>
                          {CHANGE_ICONS[change.field]} {locale === "ar" ? CHANGE_LABELS[change.field].ar : CHANGE_LABELS[change.field].en}
                        </span>
                      </td>
                      <td>{change.before}</td>
                      <td>{change.after}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
            {!rows.length && <Empty text="No differences match these filters." />}
          </Card>
        </>
      )}
      {!diff && <Empty text="Choose a baseline and a comparison above." />}
    </>
  );
}

/* --------------------------------------------------------- Clone semester */

export function ClonePage() {
  const { data, setDataWithSnapshot, setToast } = useApp();
  const [semester, setSemester] = useState("");
  const [options, setOptions] = useState<CloneOptions>(DEFAULT_CLONE_OPTIONS);
  const [review, setReview] = useState<ReturnType<typeof cloneReview> | null>(null);
  const [errors, setErrors] = useState<FormError[]>([]);
  if (!data) return <Loading />;

  const run = async () => {
    if (!semester.trim()) {
      setErrors([{ field: "clone-semester", message: "Enter the semester the clone is for." }]);
      return;
    }
    setErrors([]);
    const cloned = cloneSemester(data, semester.trim(), options);
    setReview(cloneReview(data, cloned));
    await setDataWithSnapshot(`Before cloning into semester ${semester.trim()}`, cloned);
    setToast(`Cloned into semester ${semester.trim()} as a draft. The source semester was not modified; roll back from Versions if needed.`);
  };

  return (
    <>
      <PageTitle title="Clone semester" subtitle="Copy reference data into a new semester. The clone starts as a draft and is never published or approved automatically." />
      <ErrorSummary errors={errors} />
      <Card>
        <label htmlFor="clone-semester">
          New semester label
          <input id="clone-semester" value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="e.g. 1449" aria-invalid={errors.some((e) => e.field === "clone-semester")} />
        </label>
        <h2>What to copy</h2>
        {(Object.keys(options) as (keyof CloneOptions)[]).map((key) => (
          <label className="toggle" key={key}>
            <input type="checkbox" checked={options[key]} onChange={(e) => setOptions({ ...options, [key]: e.target.checked })} />
            <span>{key}</span>
          </label>
        ))}
        <Button onClick={() => void run()}>
          <Copy /> Clone into a new draft semester
        </Button>
        <p className="footnote">A rollback snapshot of the source semester is saved before the clone is written.</p>
      </Card>

      {review && (
        <Card>
          <h2>Review the clone</h2>
          <div className="stat-row">
            <Stat label="Added sections" value={review.addedSections.length} />
            <Stat label="Removed sections" value={review.removedSections.length} />
            <Stat label="Changed faculty" value={review.changedFaculty.length} />
            <Stat label="Changed availability" value={review.changedAvailability.length} />
            <Stat label="Changed capacities" value={review.changedCapacities.length} />
            <Stat label="New courses" value={review.newCourses.length} />
            <Stat label="Discontinued courses" value={review.discontinuedCourses.length} />
            <Stat label="Updated mappings" value={review.updatedMappings.length} />
          </div>
          <p className="footnote">Sections are never copied automatically: import the new semester&apos;s offerings before generating.</p>
        </Card>
      )}
    </>
  );
}
