/**
 * Parser for the room-distribution workbook.
 *
 * The workbook is a set of colour-coded daily grids rather than a room table.
 * Main sheets carry a capacity column; the ق2 sheets do not, and their rooms
 * stay "capacity unknown" until someone supplies a number. Colours carry no
 * written legend, so no meaning is inferred here — every distinct colour is
 * reported for an administrator to map.
 */

import type { ColorMeaning, SourceRef } from "../types";
import { columnLetter, detectSheetRole, foldArabic, squash, type DayName } from "./normalize";
import type { SheetGrid, WorkbookGrid } from "./workbook";

export type RoomGridEntry = {
  roomCode: string;
  day: DayName;
  period: number;
  color: string | null;
  /** Free text written under a period, e.g. a manual reservation. */
  text: string | null;
  ref: SourceRef;
};

export type ParsedRoom = {
  code: string;
  displayName: string;
  group: string;
  campus: string;
  capacity: number | null;
  capacityUnknown: boolean;
  sourceRefs: SourceRef[];
};

export type ColorObservation = {
  color: string;
  count: number;
  /** How many of those cells sit inside a period grid rather than a caption. */
  gridCount: number;
  samples: string[];
  /** Left unmapped until an administrator chooses. */
  meaning: ColorMeaning;
};

export type RoomParseResult = {
  workbook: string;
  rooms: ParsedRoom[];
  entries: RoomGridEntry[];
  colors: ColorObservation[];
  textReservations: RoomGridEntry[];
  sheets: { name: string; role: string; day?: DayName; rows: number; gridPeriods: number }[];
  /** Rows whose period run did not match the sheet's grid width. */
  gridWidthNotes: { ref: SourceRef; observed: number; used: number }[];
  /** Highest period column found in the physical grids. */
  maxGridPeriod: number;
};

const ROOM_CODE = /^\d{2}-\d\.\d{3}$/;

function isRoomCode(value: string): boolean {
  return ROOM_CODE.test(squash(value));
}

export function parseRoomWorkbook(workbook: string, wb: WorkbookGrid): RoomParseResult {
  const rooms = new Map<string, ParsedRoom>();
  const entries: RoomGridEntry[] = [];
  const textReservations: RoomGridEntry[] = [];
  const colorCounts = new Map<string, { count: number; gridCount: number; samples: string[] }>();
  const noteColor = (color: string, label: string, inGrid: boolean) => {
    const bucket = colorCounts.get(color) ?? { count: 0, gridCount: 0, samples: [] };
    bucket.count += 1;
    if (inGrid) bucket.gridCount += 1;
    if (bucket.samples.length < 5) bucket.samples.push(label);
    colorCounts.set(color, bucket);
  };
  const sheets: RoomParseResult["sheets"] = [];
  const gridWidthNotes: RoomParseResult["gridWidthNotes"] = [];
  let maxGridPeriod = 0;

  /** Length of the contiguous 1, 2, 3, ... run that starts after a room code. */
  const runLength = (grid: SheetGrid, row: number, afterColumn: number) => {
    let expected = 1;
    for (let c = afterColumn + 1; c <= grid.columns; c += 1) {
      if (Number(grid.cell(row, c).display) !== expected) break;
      expected += 1;
    }
    return expected - 1;
  };

  /** Column holding the room code on a row, if any. */
  const codeColumn = (grid: SheetGrid, row: number) => {
    for (let c = 1; c <= grid.columns; c += 1) {
      if (isRoomCode(grid.cell(row, c).display)) return c;
    }
    return 0;
  };

  for (const grid of wb.sheets()) {
    const detected = detectSheetRole(grid.trimmedName);
    if (detected.role !== "rooms-main" && detected.role !== "rooms-q2") {
      sheets.push({ name: grid.name, role: detected.role, rows: grid.rows, gridPeriods: 0 });
      continue;
    }
    const day = detected.day as DayName;
    const group = detected.role === "rooms-q2" ? "ق2" : "المبنى الرئيسي";
    // The informational columns beside some grids can continue the 1, 2, 3, ...
    // run by coincidence, so the sheet's grid width is taken to be the width
    // most of its rows agree on rather than the longest run found.
    const runs = new Map<number, number>();
    for (let r = 1; r <= grid.rows; r += 1) {
      const col = codeColumn(grid, r);
      if (!col) continue;
      const len = runLength(grid, r, col);
      if (len > 0) runs.set(len, (runs.get(len) ?? 0) + 1);
    }
    const gridWidth = [...runs.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
    sheets.push({ name: grid.name, role: detected.role, day, rows: grid.rows, gridPeriods: gridWidth });

    // Every manually filled cell is reported, grid or not, so no colour is hidden.
    for (let r = 1; r <= grid.rows; r += 1) {
      for (let c = 1; c <= grid.columns; c += 1) {
        const cell = grid.cell(r, c);
        if (cell.color) noteColor(cell.color, `${grid.trimmedName}!${cell.ref}`, false);
      }
    }

    for (let r = 1; r <= grid.rows; r += 1) {
      // Find the room code anywhere on the row; main sheets put it in column C,
      // the ق2 sheets in column A.
      let codeCell: { value: string; column: number } | null = null;
      for (let c = 1; c <= grid.columns; c += 1) {
        const value = grid.cell(r, c).display;
        if (isRoomCode(value)) {
          codeCell = { value: squash(value), column: c };
          break;
        }
      }
      if (!codeCell) continue;

      const code = codeCell.value;
      // Capacity and display name sit to the left of the code on main sheets.
      let capacity: number | null = null;
      let displayName = "";
      for (let c = 1; c < codeCell.column; c += 1) {
        const value = grid.cell(r, c).display;
        if (!value) continue;
        const n = Number(value);
        if (Number.isFinite(n) && n > 0 && capacity === null) capacity = n;
        else if (!displayName) displayName = value;
      }

      const existing = rooms.get(code);
      const refs = [{ workbook, sheet: grid.name, row: r, column: columnLetter(codeCell.column) }];
      if (existing) {
        existing.sourceRefs.push(...refs);
        if (existing.capacity === null && capacity !== null) {
          existing.capacity = capacity;
          existing.capacityUnknown = false;
        }
        if (!existing.displayName && displayName) existing.displayName = displayName;
      } else {
        rooms.set(code, {
          code,
          displayName: displayName || code,
          group,
          campus: group,
          capacity,
          capacityUnknown: capacity === null,
          sourceRefs: refs,
        });
      }

      // Period cells follow the code as a contiguous run 1, 2, 3, ... Anything
      // after the run breaks (a blank, or a restart) belongs to the sheet's
      // informational columns and is not part of the physical grid.
      const observedRun = runLength(grid, r, codeCell.column);
      if (observedRun !== gridWidth) {
        gridWidthNotes.push({ ref: { workbook, sheet: grid.name, row: r, column: columnLetter(codeCell.column) }, observed: observedRun, used: gridWidth });
      }
      let expected = 1;
      for (let c = codeCell.column + 1; c <= codeCell.column + gridWidth && c <= grid.columns; c += 1) {
        const cell = grid.cell(r, c);
        if (Number(cell.display) !== expected) break;
        const period = expected;
        expected += 1;
        maxGridPeriod = Math.max(maxGridPeriod, period);
        const ref: SourceRef = { workbook, sheet: grid.name, row: r, column: columnLetter(c) };
        const entry: RoomGridEntry = { roomCode: code, day, period, color: cell.color, text: null, ref };
        // The ق2 sheets write a reservation caption on the row beneath the grid.
        const below = r + 1 <= grid.rows ? grid.cell(r + 1, c) : null;
        if (below && below.display && !Number.isFinite(Number(below.display)) && !isRoomCode(below.display)) {
          entry.text = below.display;
          textReservations.push({ ...entry, ref: { ...ref, row: r + 1 } });
        }
        entries.push(entry);
        if (cell.color) {
          const bucket = colorCounts.get(cell.color);
          if (bucket) bucket.gridCount += 1;
        }
      }
    }
  }

  const colors: ColorObservation[] = [...colorCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([color, info]) => ({ color, count: info.count, gridCount: info.gridCount, samples: info.samples, meaning: "unmapped" as ColorMeaning }));

  return {
    workbook,
    rooms: [...rooms.values()].sort((a, b) => a.code.localeCompare(b.code)),
    entries,
    colors,
    textReservations,
    sheets,
    gridWidthNotes,
    maxGridPeriod,
  };
}

/** Apply a saved colour profile to grid entries. Unmapped colours stay unmapped. */
export function applyColorProfile(entries: RoomGridEntry[], map: Record<string, ColorMeaning>) {
  return entries.map((entry) => ({
    ...entry,
    meaning: (entry.color ? (map[entry.color] ?? "unmapped") : "available") as ColorMeaning,
  }));
}

export { foldArabic };
