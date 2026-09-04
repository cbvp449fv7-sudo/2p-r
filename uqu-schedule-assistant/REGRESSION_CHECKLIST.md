# Regression checklist

Only directly verified items are checked. Browser items were driven end to end
against a running dev build; the real workbooks were imported locally and the
resulting screenshots stay off this repository.

## Original MVP · fictional demo dataset

Date: 2026-09-03

- [x] Every route loads (22 routes; build route collection plus browser deep links)
- [x] Dashboard values and demo counts (12/15/10/8) unchanged after the full run
- [x] Import validation, manual CRUD, persistence
- [x] Arabic/English search and combined-filter no-results
- [x] Deterministic and impossible generation
- [x] Hard constraints, scoring modes, locked assignments (unit/browser)
- [x] Form move, conflict rejection, valid correction, lock, undo/redo controls
- [x] Versions, backup, reload persistence, restore control
- [x] Excel export and print/PDF layout
- [x] Arabic RTL, English LTR, light/dark persistence
- [x] Mobile sidebar open/close/navigation and no page overflow at 390×844
- [x] Reload, deep links, clean final console (0 console errors)
- [x] Typecheck, lint, tests, production build

## 1448 update

Date: 2026-09-03 · real workbooks imported locally, never committed

- [x] Both workbooks parse in the browser; sheet roles detected after trimming
- [x] Roster: 38 internal, 29 external, 3 repeated display names, subtotals skipped
- [x] Sheet comparison reproduces 398 matched / 52 only-481 / 11 only-reviewed /
      21 changed faculty / 1 changed time / 4 new room codes
- [x] `9-19` blocks with its source cell (`481!J189`, `481 مراجعة!J158`)
- [x] Trailing separators normalize and are reported
- [x] Multi-day source rows split while keeping one row identity
- [x] 12 course patterns detected and confirmable
- [x] 9 room colours listed for mapping; none guessed
- [x] 4 written reservations imported from the `ق2` Thursday sheet
- [x] 12 rooms without capacity flagged and fillable during import
- [x] 74 track/department pairs mappable to colleges
- [x] 96 schedule name spellings, 45 requiring manual confirmation
- [x] Valid-rows-only import confirmed explicitly; excluded rows recorded
- [x] Import commits (463 meetings from 462 source rows) with a rollback snapshot
- [x] No Activity 2 assignment holds a room; `عن بُعد` shown instead
- [x] Preparatory hours shown split into in-person, remote, and combined
- [x] Generator runs to its timeout and queues what it cannot place
- [x] Unscheduled queue explains each item; a repair applies through an impact preview
- [x] The single in-person Thursday assignment is flagged, not silently accepted
- [x] Impact preview appears before a material editor move
- [x] Scenario discarded without touching the master schedule
- [x] Scenario promoted into a new draft, previous schedule saved as a version
- [x] Bulk edit previews, reports each outcome, and rolls back
- [x] Period clock times configurable; ICS blocked until they are confirmed
- [x] Approval blocked with an honest count while blocking errors remain
- [x] Clean draft sent for review, approved, and locked; edits refused with a reason
- [x] Reopen refused without a reason; with one it creates a new draft and logs it
- [x] Version comparison shows field-level changes
- [x] Travel-time rule stored and explained
- [x] Individual faculty schedule exports to Excel and ICS
- [x] Two college workbooks export with zero overlapping assignments between them
- [x] All colleges bundle into one ZIP with Arabic filenames
- [x] Distribution log records packages and marks one manually delivered
- [x] Semester clones into a draft without modifying the source
- [x] Data persists across reload; demo counts restore unchanged
- [x] Desktop, tablet, and mobile widths with no horizontal overflow
- [x] Light and dark themes; Arabic RTL and English LTR
- [x] 0 console errors across the whole run

## Not verified

- Deployment to a real URL. The app is local only in this update.
