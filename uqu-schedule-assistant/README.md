# UQU Schedule Assistant

A private bilingual Arabic/English scheduling MVP for administrators in the UQU English Department context. It provides persistent local records, deterministic generation, precise conflict messages, manual editing, versions, and Excel/print exports.

> Internal scheduling prototype—not an official UQU system. All bundled people and records are fictional. Confirm institutional and departmental rules before operational use.

## Run locally

Requires Node.js 20.9+. Run `npm install`, then `npm run dev`, and open `http://localhost:3000`. Quality commands are `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

## Architecture

- `src/lib/types.ts`: shared stable-ID data contracts.
- `src/lib/schemas.ts`: Zod import schemas and validation helpers.
- `src/lib/rules.ts`: one source for loads, teaching units, overtime, and SAR 150 potential compensation.
- `src/lib/engine.ts`: deterministic MRV-ordered backtracking, candidate ordering, conflict checks, timeout, and three modes.
- `src/lib/storage.ts`: versioned IndexedDB persistence and migration defaults.
- `src/lib/demo.ts`: 12 fictional faculty, 15 courses, 10 sections, and 8 rooms.
- `src/components/pages.tsx`: page features, import/export, editing, reports, and versions.

Ten routes cover Dashboard, Data Import, Generator, Editor, Faculty, Courses & Sections, Rooms, Rules & Settings, Versions, and Reports. Theme and locale preferences persist in local storage; records live in IndexedDB.

## Scheduling algorithm

The engine expands required weekly meetings, retains locked assignments, orders work by minimum remaining candidates, and tries deterministic day/time/room candidates. It checks room, faculty, section/shared-group, campus, capacity, room type, specialization, and availability constraints. It returns an explicit no-solution result at timeout. Three modes prioritize balance, faculty preferences, or compact student times.

## Excel and exports

Data Import accepts `.xlsx`, `.xls`, and `.csv` by picker or drop zone, parses workbook sheets for review, and does not overwrite data during preview. Download the multi-sheet template for headers. Reports exports Schedule, Faculty Load, Conflicts, Faculty, Courses, Sections, and Rooms sheets with version/export date.

## Rule assumptions

Normal teaching loads: Professor 10, Associate Professor 12, Assistant Professor 14, Lecturer 16, Teaching Assistant 16, Language Instructor 18 units. Theory: one unit per completed 50 minutes; practical/field: one per completed 100 minutes. Weekly work defaults to 35 hours and is configurable through 40. Reduced loads override rank load. Overtime is above effective load, with SAR 150 potential compensation per approved extra unit. Overtime ceiling defaults to unconfirmed/no limit. Administrative faculty below 3 units receive a warning.

References are linked on Rules: [regulations](https://uqu.edu.sa/App/Regulations/1484), [department](https://uqu.edu.sa/english), [degrees](https://uqu.edu.sa/App/Degrees?dept=1&faculty=7), [historical graduate page](https://uqu.edu.sa/en/gs/46884), and [1448 graduate list](https://uqu.edu.sa/gs/152448).

## Known MVP limitations

- Storage is device/profile-local, not multi-user.
- Workbook preview/template/export work; interactive column remapping and partial-row commit are incomplete.
- The accessible form move/resize workflow works; pointer drag-and-drop is not wired.
- Faculty demonstrates create/delete; comprehensive field CRUD for every entity is incomplete.
- Deterministic modes exist, but every soft weight is not exposed as a slider or explained separately.
- PDF uses print and browser “Save as PDF,” not a dedicated PDF generator.
- Local only; no authentication, shared database, or deployment.

## Future migration and department inputs

Replace the small storage interface with repository-backed API calls, migrate stable IDs/schema versions to a transactional database, and add authenticated authorization/audit ownership. Deployment must verify persistence, deep links, refreshes, runtime errors, and the actual URL.

The department must supply actual offerings, sections, faculty/ranks/availability, student conflict groups, buildings/rooms, gender locations, approved time slots, overtime ceiling/approval workflow, and current status of the historical master’s programs.
