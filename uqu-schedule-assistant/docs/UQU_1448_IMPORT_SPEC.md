# UQU 1448 import specification

How the assistant reads the department's own workbooks, what it normalizes, what
it refuses to guess, and what every downstream feature does with the result.

No real names, section numbers, or schedules appear in this document, in the
test fixtures, or anywhere else in the repository. The real workbooks are never
committed; imported records stay in the browser's local storage on the machine
that did the import.

---

## 1. Workbook structures

### 1.1 Student schedule workbook

Three sheets. Sheet names are matched after trimming, because the roster sheet's
name begins with a space in the file.

| Sheet (after trimming) | Role | Shape |
| --- | --- | --- |
| `اعضاء التدريس1447` | Faculty roster | Grouped by job title, subtotal rows between groups, then a second header for external and cooperating members |
| `481` | Original schedule | One header row, then assignment rows, with blank separators |
| `481 مراجعة` | Reviewed schedule | The same columns, re-grouped by faculty member, with a repeated header row before each block |

Assignment columns, in the order the workbooks use them:

| Column | Header | Meaning |
| --- | --- | --- |
| A | `المسار` | Track |
| B | `القسم` | Department |
| C | `رمز المقرر` | Course code |
| D | `المقرر` | Course name |
| E | `النشاط` | Activity |
| F | `اسم المنسوب` | Faculty display name |
| G | `الشعبة` | Section number |
| H | `الخميس` | Thursday |
| I | `الاربعاء` | Wednesday |
| J | `الثلاثاء` | Tuesday |
| K | `الاثنين` | Monday |
| L | `الاحد` | Sunday |

Anything to the right of column L is read as an extra value with its own cell
reference. In the reviewed sheet this is where manually entered room codes live.

Roster columns: an overall index, a per-title index, `الاسم`,
`المسمى الوظيفي`, `العبء النظامي`, `تاهيلي`, `اضافية`, `انتظام`, and
`اجمالي الساعات`. The external block replaces the first two headers with
`خارج المعهد` and `الكلية-تعاون`.

### 1.2 Room distribution workbook

Ten sheets: five main-group daily grids (Sunday to Thursday) and five `ق2`
daily grids. They are colour-coded layouts, not a room table.

A main-group row is `capacity | display name | room code | period 1 … period N`.
A `ق2` row is `room code | period 1 … period N`, and the row beneath it carries
any written reservation under the matching period column.

The grid width is taken to be the width most rows on a sheet agree on, because
the informational columns beside some grids continue the `1, 2, 3, …` run by
coincidence. Rows whose run differs are recorded with their cell reference.

---

## 2. Field mappings

| Workbook field | Application field | Notes |
| --- | --- | --- |
| `المسار` | `Assignment.track`, `Section.track` | Part of the composite section identity |
| `القسم` | `Assignment.department`, `Section.department` | Part of the composite section identity |
| `رمز المقرر` | `Assignment.courseCode`, `Course.code` | |
| `النشاط` | `Assignment.activity` | Drives the delivery mode |
| `اسم المنسوب` | resolved to `Assignment.facultyId` through an alias | Never matched by name alone |
| `الشعبة` | `Section.sectionNumber` | Not unique on its own |
| weekday cell | `Assignment.day` + `Assignment.periods` | One assignment per day cell |
| extra column value | `Assignment.roomId`, when it matches a known room code | Ignored for remote activities |
| `العبء النظامي` | `Faculty.workbookLoads.normal` | Overrides the rank default |
| `تاهيلي` | `Faculty.workbookLoads.preparatory` | |
| `اضافية` | `Faculty.workbookLoads.additional` | An additional-program category, **not** approved overtime |
| `انتظام` | `Faculty.workbookLoads.regular` | |
| `المسمى الوظيفي` | `Faculty.jobTitleAr` | Kept verbatim; mapped to a default load separately |
| room code | `Room.code`, `Room.id` | |
| capacity | `Room.capacity`, or `null` when absent | |
| fill colour | `RoomGridCell.color` | Meaning is chosen by an administrator |
| caption under a period | `RoomGridCell.text` | Imported as a reviewable occupied period |

Every imported value keeps its workbook name, sheet name, row, column, raw
value, normalized value, and validation state. No source row is discarded,
altered, or merged silently: rows that cannot be understood are returned as
anomalies, and rows that cannot be imported are recorded with the reason.

---

## 3. Normalization rules

**Arabic text.** Whitespace is collapsed; for comparison only, diacritics and
tatweel are stripped and hamza forms, `ى`/`ي`, `ة`/`ه`, `ؤ`/`و`, and `ئ`/`ي` are
folded. `تأهيلي` and `تاهيلي` therefore compare equal. The raw text is always
kept alongside.

**Headers.** Matched against a list of known spellings per logical column, after
folding. Repeated header rows are skipped wherever they appear; blank rows are
counted as separators.

**Periods.** Excel converted many period pairs into dates with an `m-d` number
format, so a cell reading `1-2` is stored as a date whose month is 1 and day
is 2. The displayed month-day pair is the period pair — never a calendar date
and never a serial number.

| Input | Result |
| --- | --- |
| `5-6-7-8` | periods 5, 6, 7, 8 |
| `9-10-11-12` | periods 9, 10, 11, 12 |
| date formatted `m-d`, showing `1-2` | periods 1, 2 |
| date formatted `m-d`, showing `3-4` | periods 3, 4 |
| `7-8-` | periods 7, 8, with the normalization reported |
| `5-6-` | periods 5, 6, with the normalization reported |
| `9-19` | **blocking error**; 19 is outside the observed 1–12 range |
| `24-0.010` | **blocking error**; not a period value |

A value such as `9-19` may have been intended as `9-10`, but it is never
repaired automatically. It appears in the importer's blocking list and in the
Data Quality Center with its cell reference until someone corrects it, or the
administrator explicitly confirms a valid-rows-only import.

A source row may carry meetings on more than one day. Each day becomes its own
internal assignment; all of them keep the same `sourceRowId`.

---

## 4. Sheet comparison

Neither `481` nor `481 مراجعة` is treated as authoritative.

Identity is composite. A section is `track | department | course code | section
number`; an assignment adds the activity. A section number alone is not unique —
the same number appears under different tracks.

The comparison reports, per record: matched, only in one sheet, changed faculty
(with spelling-only differences called out separately), changed time, and newly
entered room codes. Where a sheet repeats a composite key, every row is still
compared and the repetition is reported rather than merged away.

The administrator chooses to use `481`, use `481 مراجعة`, or merge with the
reviewed records as overrides, and can override that choice per record (keep the
original, keep the reviewed, import both, or drop it). Resulting counts are
previewed before anything is committed.

### Figures observed in the department's files

Independently reproduced by the parser and by a separate analysis of the same
workbooks:

| Measure | `481` | `481 مراجعة` |
| --- | --- | --- |
| Assignment rows | 450 | 411 |
| Composite sections | 136 | 135 |
| Activity 2 rows | 136 | 101 |
| Distinct displayed faculty names | 90 | 60 |
| Rows without a faculty member | 3 | 0 |
| Rows carrying a room code | 0 | 4 |
| Thursday meetings | 34 | 31 |
| — of those, in person | 1 | 0 |
| Rows with an out-of-range period | 1 | 1 |

Comparison: 398 matching composite assignments, 52 only in `481`, 11 only in
`481 مراجعة`, 21 assignments with a changed faculty member (19 on distinct keys
plus 2 under a repeated key), 1 with a changed time, and 4 newly entered room
codes.

The reviewed sheet also contains one row with no course code and no activity
(a caption), which is kept as a reviewable anomaly rather than imported.

---

## 5. Activity rules

`نشاط 2` is delivered remotely. This is a hard rule, enforced at import,
generation, manual editing, bulk editing, validation, and export:

- `roomId` is always `null`.
- No room candidate is ever generated for it.
- It never reserves or occupies a physical room, and never appears in physical
  room-utilization figures.
- Moving it never requests a room.
- It is labelled `عن بُعد` in faculty, section, college, Excel, print, and
  calendar output.
- Giving it a physical room is a blocking error.

It still counts toward faculty teaching load, appears in faculty and student
schedules, creates faculty and section time conflicts, and respects availability
and locked status.

### Detected course patterns

Read from the workbook and shown for confirmation during import:

| Course | Activity | Observed duration |
| --- | --- | --- |
| ELIE1201 | Activity 1 | 4 periods |
| ELIE1201 | Activity 2 | 4 periods |
| ELIE1201 | Activity 3 | 2 periods |
| ELIE1201 | Activity 4 | 2 periods |
| ELIH1101 | Activity 1 | 4 periods |
| ELIH1101 | Activity 2 | 4 periods |
| ELIH1101 | Activity 3 | 2 periods |
| ELIH1101 | Activity 4 | 2 periods |
| ELIN1301 | Activity 1 | 4 periods |
| ELIN1301 | Activity 2 | 4 periods |
| ELIN1301 | Activity 3 | 2 periods |
| ELIG1401 | Activity 2 | 4 periods |

Confirmed patterns are saved as editable course templates. Where a pattern was
observed with more than one duration, every observed duration and its frequency
is shown; nothing is hidden.

---

## 6. Thursday

Thursday is strongly avoided for in-person teaching, not forbidden.

- A high, configurable soft penalty applies to in-person Thursday placement
  (default 80).
- Candidate ordering tries Sunday to Wednesday first, in every generation mode.
- Thursday is used only when no earlier day satisfies every hard constraint, and
  the generator records a written explanation on the assignment.
- A manual in-person Thursday assignment produces a warning and requires a
  written reason before it can be applied.

Remote Activity 2 may occur on Thursday. It receives no room, carries a much
lower configurable penalty (default 5), and is never reported as physical
Thursday attendance.

The reviewed workbook contains 31 Thursday assignments, all of them remote
Activity 2. The original sheet contains one non-Activity-2 Thursday assignment;
it is imported and flagged for review, never silently accepted or removed.

---

## 7. Preparatory sections

`تاهيلي` and `تأهيلي` are both recognised, in the track and in the department.

For every composite preparatory section:

- Total weekly **in-person** periods, excluding Activity 2, must fall between 6
  and 8 inclusive (both bounds configurable).
- Activity 2 is recorded separately because it is remote.
- Activity 2 still counts toward faculty load and toward the student timetable.
- The interface shows in-person preparatory hours, remote Activity 2 hours, and
  the combined total.

Observed in the department's files: in `481`, 37 of 39 preparatory sections have
6 or 8 in-person periods once Activity 2 is excluded, and 2 have only remote
Activity 2. In `481 مراجعة`, 35 of 38 have 6 or 8, and 3 have only remote
Activity 2. Incomplete and remote-only preparatory sections are flagged; missing
meetings are never invented.

---

## 8. Faculty aliases and loads

The roster holds 38 internal records and 29 external or cooperating records. It
has no stable identifiers, carries honorific prefixes, spells some names
differently in the schedule sheets, and contains three groups of repeated
display names.

**Identity** is generated from the workbook origin and the roster row, so two
people who share a display name keep separate records.

**Matching** strips honorifics for comparison only. A single exact match
resolves automatically; anything ambiguous, partial, or repeated is left
unresolved for manual confirmation on the alias screen. Faculty are never merged
by name alone.

**Loads** preserve the workbook's own categories:

```
total = preparatory + additional + regular
```

`اضافية` is preserved as a separate additional-program category. It is **not**
interpreted as approved overtime. Overtime is calculated independently, as the
amount by which assigned units exceed the applicable normal or reduced load.

An explicit workbook load value overrides the rank default for that person. Local
job titles, including practising and advanced teacher titles, are preserved
verbatim, with a configurable title-to-default-load map on the Rules page.

---

## 9. Room colours and capacities

The room workbook contains manually applied fills with no written legend, no
comments, and no conditional-formatting rules. **No meaning is inferred.**

During import the assistant lists every distinct colour with its sample cells
and occurrence counts, including how many of those cells sit inside a period
grid, and asks the administrator to map each one to: occupied/reserved,
unavailable, available, informational, or ignore. The result is saved as a
reusable profile, and the source colour is kept for auditing.

Written reservations found beneath a period column are imported as reviewable
occupied or blocked periods, with their cell reference.

Observed inventory: 37 unique room codes — 25 main-group rooms with capacities
of 41, 42, or 49, and 12 `ق2` rooms with no capacity. The physical grids cover
periods 1 to 10, while schedule data uses periods up to 12, generally where no
room is needed. Nine distinct fill colours are present.

Rooms without a capacity remain **capacity unknown**. They are not assigned under
a capacity constraint until a capacity is supplied or an authorized override
reason is recorded.

---

## 10. College mapping

The workbooks carry `المسار` and `القسم` but no normalized college field.

A configurable mapping step lists every unique track and department pair, maps
each to one or more colleges with Arabic and English names, combines spelling
variants through the same folding used elsewhere, and saves reusable mappings.
A pair mapped to more than one college produces a shared section.

Ambiguous mappings are never guessed. Unmapped assignments are flagged, and bulk
export is blocked until every one is either mapped or explicitly filed under
`غير مصنف`, which is offered as a college.

---

## 11. College export structure

Each college receives its own `.xlsx` workbook. Filenames are Arabic and safe on
every platform, for example `جداول_كلية_الهندسة_1448_الإصدار_3.xlsx`.

| Sheet | Contents |
| --- | --- |
| `ملخص` | College, semester, schedule version and number, export date, state, section count, scheduled meetings, remote meetings, in-person meetings, shared sections, remaining warnings |
| `الجدول الموحد` | Track, department, course code and name, activity, section, faculty member, day, period or configured clock time, room or `عن بُعد`, shared-section status |
| `جداول الأقسام` | Per department: sections, meetings, remote, in person |
| `جداول الشعب` | Per section: track, department, course, meetings, in-person periods, remote periods, preparatory flag |
| `القاعات المستخدمة` | Only the rooms this college's own in-person meetings use |
| `ملاحظات` | Thursday fallback explanations, authorized overrides, shared-section explanations, remaining warnings |

Every sheet is right-to-left with a filtered, frozen header row, readable column
widths, and a print area.

A college workbook must not expose another college's schedules, another
college's unrelated rooms, a faculty member's assignments in unrelated colleges,
or private workload and administrative information the college does not need.
This is enforced by slicing the dataset per college before the workbook is
built, and is covered by tests and by an inspection of two real exported files
(zero overlapping assignments between them).

Shared assignments are labelled `مشترك` and stay linked to one master
assignment, which is named in the notes sheet.

`تصدير جميع الكليات` bundles one workbook per college into a single ZIP.

---

## 12. Data Quality Center

Runs before generation, approval, and export. Categories:

`invalid-period`, `missing-faculty`, `missing-capacity`,
`duplicate-faculty-name`, `unresolved-alias`, `unmapped-college`,
`preparatory-hours`, `remote-room`, `thursday-in-person`, `missing-pattern`,
`room-conflict`, `faculty-load`, `single-sheet-record`, `unmapped-room-color`.

Each finding carries a severity (blocking error, warning, information), a
message in Arabic and English, the affected record, its source workbook, sheet,
row, and column where one exists, and a link that opens the record. Findings can
be filtered by category, severity, source sheet, and free text, selected in
bulk, re-validated after corrections, and exported as a report.

Approval requires zero blocking errors, and bulk export is blocked while any
assignment has no college.

**Failed forms** show a focusable error summary at the top of the page, move
keyboard focus to it after a failed submission, link every summary item to the
invalid field or record, and keep a specific inline error beside the field.
Colour is never the only signal.

---

## 13. Unscheduled queue

Every meeting the generator cannot place is listed with its course, activity,
section, faculty, college, required duration, the hard constraints that blocked
it, the days it considered, the rooms it rejected and why, whether Thursday
would solve it, and whether a manual override would be required.

Ranked repair suggestions cover: an alternative valid time, an alternative room,
a different qualified faculty member, moving another unlocked assignment, using
Thursday as a fallback, entering a missing room capacity, and resolving an
unavailable faculty period. One can be applied, several compared, or compatible
items batch-repaired. An item can also be left unresolved with a documented
reason, which is written to the audit log.

Locked assignments are never moved, and no hard constraint is bypassed silently.
Suggestions that need a manual edit report that fact instead of pretending to
apply. The dashboard shows the exact unscheduled count and links here.

---

## 14. Change impact preview

Before a manual move, bulk edit, faculty change, room change, deletion,
regeneration, or version restore, the assistant shows: assignments affected, new
and resolved conflicts, faculty loads affected, sections, rooms, and colleges
affected, college exports that become outdated, versions or approvals
invalidated, Thursday usage before and after, and preparatory-hour changes.

A change is treated as material — and needs the full preview — when it touches
more than one assignment, creates a conflict, crosses colleges, invalidates an
approval, outdates an export, or changes preparatory hours. Minor safe edits
apply directly.

---

## 15. What-if scenarios

A scenario is a labelled copy of the current schedule. Scenario mode is banner-
marked so it cannot be mistaken for the active schedule. Constraints and weights
can be changed, up to three scenarios compared on conflicts, overtime, gaps,
Thursday usage, room use, and unscheduled meetings, and one promoted into a new
draft version — which first saves the current schedule as a version. Discarding
a scenario leaves the active schedule untouched. Nothing reaches the master
schedule until it is explicitly promoted.

---

## 16. Approval workflow

States: draft, under review, approved, distributed, superseded.

There is no authentication, so a configurable local operator name is recorded
rather than a verified identity.

- Draft schedules remain editable.
- Sending for review creates a version snapshot.
- Approval requires zero blocking errors.
- Approved and distributed schedules are locked against editing; every editing
  path refuses with an explanation.
- Reopening requires a written reason, creates a new draft version, increments
  the version number, marks the previous approved version superseded, and marks
  previously exported college packages outdated.
- Distribution records the exact approved version.

The state is shown on the dashboard, the editor, the workflow page, and in
exports.

---

## 17. Bulk editing

Multi-select with actions for college, faculty, room, delivery mode, lock state,
moving compatible assignments, room capacity, room type, and availability.

Before applying: every selected record is validated, the impact is previewed, and
a rollback snapshot is taken. Results separate applied, blocked, and warned
records with a message each. Partial success is reported as partial, never as
complete success.

---

## 18. Semester cloning

Copies faculty and aliases, courses and activity patterns, rooms and capacities,
period definitions, constraints, college mappings, faculty preferences, and room
colour profiles.

The clone begins as a draft, is never published or approved automatically, and
asks the administrator to review added and removed sections, changed faculty,
changed availability, changed room capacities, new and discontinued courses, and
updated college mappings. The source semester is never modified, and a rollback
snapshot is taken first.

---

## 19. Version comparison

Compares two versions or scenarios and reports additions, removals, and changes
to faculty, time, day, room, delivery mode, lock status, college, and approval
state, with field-level rows, filters, summary counts, a print view, and an
Excel change report. Every change type is shown with an icon and a text label as
well as colour.

---

## 20. Calendar export

Available for an individual faculty member, an individual section, a selected
college, or the entire approved schedule.

Requirements: Asia/Riyadh timezone; UIDs derived from the version and the
assignment, so regenerating the same approved version never produces duplicate
identifiers; course, activity, section, room or `عن بُعد`, and college included;
weekly recurrence preserved.

Export is **disabled with a clear explanation** until every period carries a
confirmed clock time. No external calendar account is contacted.

---

## 21. Distribution log

Every generated package is recorded locally with its college, schedule version,
export timestamp, filename, assignment count, exporting operator name, a stable
checksum, and a status of generated, delivered manually, replaced, or outdated.

A package can be marked as manually delivered. Warnings appear when a newer
approved version exists, when a package is outdated, when a college has not
received the current approved version, and when a college is about to receive
the same version again.

The assistant never claims a file was emailed or uploaded. It records files you
generated and hand over yourself.

---

## 22. Travel-time rules

Configurable building-to-building and campus-to-campus transition minutes, a
minimum break, and a hard-or-soft flag per rule. Consecutive meetings for one
faculty member in distant buildings without enough transition time are prevented
or warned about, with a precise explanation naming both buildings, the time
available, and the time required.

Remote meetings have no room; whether they take part in travel checks at all is
configurable and defaults to off.

---

## 23. Workload distribution report

Shows, per faculty member: normal and reduced load, effective load, assigned
teaching units, regular, preparatory, and additional categories, remote and
in-person totals, overtime, number of teaching days, Thursday assignments, early
and late sessions, weekly gaps, maximum consecutive periods, and building
transitions.

There is no unexplained fairness score. An optional summary index is off by
default; when shown it publishes its formula, exposes configurable weights, and
displays the underlying values:

```
index = w1·|assigned − effective load| + w2·(weekly gaps) + w3·(Thursday assignments)
      + w4·(building transitions) + w5·(early + late sessions)
```

No one is labelled unfair or underperforming. This report is decision support,
not an official employment judgement.

---

## 24. Complete import workflow

1. Upload both workbooks.
2. Detect sheet roles (after trimming) and preview every sheet.
3. Normalize headers and Arabic variants.
4. Parse faculty, sections, assignments, and rooms with full provenance.
5. Compare `481` with `481 مراجعة`.
6. Resolve changed and unmatched assignments.
7. Resolve faculty aliases and repeated names.
8. Resolve invalid periods.
9. Confirm course and activity patterns.
10. Map room colours.
11. Enter missing capacities.
12. Map tracks and departments to colleges.
13. Run the Data Quality Center.
14. Preview final counts and warnings.
15. Create a restorable snapshot.
16. Commit the import.
17. Roll back from Versions if needed.

A valid-rows-only import is available only after explicit confirmation, and every
excluded row is recorded with its reason. Success is never reported while records
are being skipped.

---

## 25. Known uncertainties

These are recorded rather than guessed at, and should be confirmed with the
department before operational use:

- **Clock times.** The workbooks schedule by period number. Periods 1 to 12 are
  displayed as `الفترة N` until real times are configured; the nominal times
  used for overlap arithmetic are 50-minute slots from 08:00 and are not a
  claim about the actual timetable.
- **`9-19`.** Present at `481!J189` and `481 مراجعة!J158`. Period 19 is outside
  the observed 1–12 range. It may have been intended as `9-10`, but that is not
  assumed.
- **Room colours.** No legend exists in the file. Every meaning comes from the
  administrator.
- **`ق2` capacities.** Twelve rooms have no capacity in the workbook.
- **The single in-person Thursday assignment** in `481` is flagged rather than
  resolved.
- **Two preparatory sections in `481` and three in `481 مراجعة`** appear to have
  only remote Activity 2 meetings. The missing in-person meetings are not
  invented.
- **Repeated composite keys.** `481 مراجعة` uses the same composite key twice for
  two different faculty members. Both rows are kept and reported.
- **Repeated roster names.** Three groups of names repeat in the roster. They
  are kept as separate people and are never merged automatically.
- **Section enrollment** is not present in the workbooks, so imported sections
  start at zero students and capacity constraints cannot be checked until
  enrollment is supplied.
- **Rank mapping.** Local job titles are mapped to a default load through a
  configurable table; the mapping itself is an assumption.
- **`اضافية`** is preserved as an additional-program category. Whether any of it
  is approved overtime is a departmental question, not a parsing one.
