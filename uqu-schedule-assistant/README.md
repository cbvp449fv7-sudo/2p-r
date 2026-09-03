# UQU Schedule Assistant

A private bilingual Arabic/English scheduling tool for administrators in the UQU
English Department context. It imports the department's own Excel workbooks,
generates and edits schedules, validates departmental rules, shows each faculty
member's timetable, and exports a separate workbook for every college — all
locally, in one browser, with no server and no account.

> Internal scheduling prototype—not an official UQU system. All bundled people
> and records are fictional. Confirm institutional and departmental rules before
> operational use.

## Run locally

Requires Node.js 20.9+. Run `npm install`, then `npm run dev`, and open
`http://localhost:3000`. Quality commands are `npm run typecheck`,
`npm run lint`, `npm test`, and `npm run build`.

## Privacy

Workbooks are parsed in the browser. Nothing is uploaded to any external
service, and imported records live in IndexedDB on the device that did the
import. Real workbooks, imported data, and screenshots containing real names are
never committed; the repository's own test fixtures are entirely invented.

## The complete workflow

1. **Import** — `/import-1448` reads the department's own formats: the student
   schedule workbook and the room distribution workbook. The guided steps are
   upload, sheet detection, sheet comparison, faculty alias resolution, invalid
   periods, course patterns, room colours, missing capacities, college mapping,
   a data quality check, and a final preview before committing. A restorable
   snapshot is taken before the import is written.
   `/import` remains available for generic Excel and CSV files with column
   mapping and an explicit valid-rows-only confirmation.
2. **Check** — `/quality` runs every validation, grouped by category and
   severity, each finding linked to its record and its source cell.
3. **Generate** — `/generator` produces three deterministic alternatives.
   `/unscheduled` explains every meeting it could not place and offers ranked
   repairs.
4. **Edit** — `/editor` supports pointer drag-and-drop and a full keyboard and
   mobile form, with an impact preview before any material change.
5. **Review workload** — `/faculty-schedule` for one person's week,
   `/fairness` for the distribution across everyone.
6. **Try alternatives** — `/scenarios` clones the schedule into a labelled
   sandbox; nothing reaches the master schedule until it is promoted.
7. **Approve** — `/workflow` moves the schedule through draft, review, approved,
   distributed, and superseded. Approval needs zero blocking errors, and an
   approved schedule is locked until it is reopened with a written reason.
8. **Distribute** — `/colleges` exports one isolated workbook per college, or all
   of them as a ZIP; `/distribution` logs every package generated on this device.
9. **Carry forward** — `/clone` copies reference data into a new draft semester
   without touching the source.

Supporting pages: `/faculty`, `/courses`, `/rooms`, `/bulk`, `/compare`,
`/versions`, `/rules`, `/reports`.

## Departmental rules for 1448

- **Activity 2 (`نشاط 2`) is remote.** It never receives a room, never occupies
  one, and is labelled `عن بُعد` everywhere. It still counts toward faculty load,
  appears in every schedule, and creates faculty and section conflicts.
- **Thursday is strongly avoided for in-person teaching.** Sunday to Wednesday
  are tried first; Thursday needs a written reason and carries a high
  configurable penalty. Remote Thursday is allowed at a much lower penalty and is
  not counted as physical Thursday attendance.
- **Preparatory sections** (`تاهيلي` and `تأهيلي`) must have between 6 and 8
  in-person periods a week, excluding Activity 2, whose remote hours are recorded
  separately.
- **Periods, not clock times.** Schedules are shown as `الفترة 1` to
  `الفترة 12` until real clock times are configured on `/rules`. Calendar export
  stays disabled until then.
- **Rooms without a capacity** stay "capacity unknown" and are not used under a
  capacity constraint until one is supplied or an override reason is recorded.
- **`اضافية`** is an additional-program category, not approved overtime.
  Overtime is calculated independently from the applicable normal or reduced
  load.

`docs/UQU_1448_IMPORT_SPEC.md` documents the workbook structures, field
mappings, normalization rules, comparison figures, and every known uncertainty.

## Architecture

- `src/lib/types.ts`: shared stable-ID data contracts.
- `src/lib/schemas.ts`: Zod import schemas and validation helpers.
- `src/lib/rules.ts`: loads, teaching units, overtime, and SAR 150 potential
  compensation.
- `src/lib/schedule-rules.ts`: the 1448 departmental rules — remote Activity 2,
  Thursday, preparatory hours, travel time, capacity.
- `src/lib/period-table.ts`: period definitions and their optional clock times.
- `src/lib/engine.ts`: deterministic MRV-ordered backtracking, candidate
  ordering, conflict checks, timeout, three modes, and unscheduled reasons.
- `src/lib/uqu/`: the dedicated 1448 importer — Arabic normalization, period
  parsing, schedule, faculty, and room parsers, sheet comparison, alias
  resolution, pattern inference, and record building. `fixtures.ts` holds the
  synthetic workbooks the tests use.
- `src/lib/quality.ts`, `unscheduled.ts`, `impact.ts`, `workflow.ts`,
  `scenarios.ts`, `bulk.ts`, `clone.ts`, `diff.ts`, `ics.ts`, `distribution.ts`,
  `fairness.ts`, `colleges.ts`: one module per feature area.
- `src/lib/xlsx-writer.ts` and `src/lib/zip.ts`: a small OOXML and ZIP writer
  used for the college exports, which need right-to-left views, frozen headers,
  filters, and print areas.
- `src/lib/storage.ts`: versioned IndexedDB persistence, migration, and
  rollback snapshots.
- `src/lib/demo.ts`: 12 fictional faculty, 15 courses, 10 sections, and 8 rooms.
- `src/components/pages/`: the page modules behind the routes.

## Scheduling algorithm

The engine expands required weekly meetings from confirmed course patterns,
retains locked assignments, orders work by minimum remaining candidates, and
tries deterministic day, period, and room candidates with Thursday always last.
It checks room, faculty, section and shared-group, campus, capacity, room type,
specialization, availability, travel time, and the remote-activity rule. It
returns an explicit no-solution result at timeout, with every unplaced meeting
and the constraints that blocked it. Three modes prioritize balance, faculty
preferences, or compact student times.

## Rule assumptions

Normal teaching loads: Professor 10, Associate Professor 12, Assistant Professor
14, Lecturer 16, Teaching Assistant 16, Language Instructor 18 units. Local
Arabic job titles map to a default load through a configurable table on
`/rules`. An explicit workbook load value overrides the rank default for that
person; a recorded reduced load overrides both. Theory: one unit per completed 50
minutes; practical/field: one per completed 100 minutes. Weekly work defaults to
35 hours and is configurable through 40. Overtime is above the effective load,
with SAR 150 potential compensation per approved extra unit. The overtime ceiling
defaults to unconfirmed/no limit. Administrative faculty below 3 units receive a
warning.

References are linked on Rules:
[regulations](https://uqu.edu.sa/App/Regulations/1484),
[department](https://uqu.edu.sa/english),
[degrees](https://uqu.edu.sa/App/Degrees?dept=1&faculty=7),
[historical graduate page](https://uqu.edu.sa/en/gs/46884), and
[1448 graduate list](https://uqu.edu.sa/gs/152448).

## Dependencies

The spreadsheet reader is `@e965/xlsx@0.20.3`, a maintained republication of
SheetJS 0.20.3 that resolves the prototype-pollution and ReDoS advisories
affecting `xlsx@0.18.5`. `npm audit` reports zero vulnerabilities. Parsing stays
behind `src/lib/uqu/workbook.ts`, file types are restricted at the picker, and
all processing is local. Writing is done by the project's own OOXML writer
rather than a second spreadsheet dependency.

## Known limitations

- Storage is device- and profile-local, not multi-user.
- PDF output uses print and the browser's "Save as PDF" rather than a dedicated
  PDF generator.
- There is no authentication; the operator name on exports and versions is a
  recorded label, not a verified identity.
- Section enrollment is absent from the department's workbooks, so imported
  sections start at zero students and capacity constraints cannot be checked
  until enrollment is supplied.
- The generator is synchronous and runs on the main thread; on a full
  department-sized dataset it works to its configured timeout before returning.
- Local only; no shared database or deployment.

## Future migration and department inputs

Replace the small storage interface with repository-backed API calls, migrate
stable IDs and schema versions to a transactional database, and add authenticated
authorization and audit ownership. Deployment must verify persistence, deep
links, refreshes, runtime errors, and the actual URL.

The department must supply actual period clock times, section enrollment,
approved room capacities for the `ق2` group, the meaning of each room colour, the
college for every track and department pair, the intended value behind the
out-of-range period, student conflict groups, gender locations, the overtime
ceiling and approval workflow, and the current status of the historical master's
programs.
