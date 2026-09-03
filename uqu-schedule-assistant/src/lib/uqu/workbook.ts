/**
 * Thin adapter over the spreadsheet library.
 *
 * Parsing stays behind this one module so the library can be swapped without
 * touching the importers, and so every read keeps its cell reference, raw
 * value, displayed value, number format, and fill colour.
 */

import * as XLSX from "@e965/xlsx";
import { columnLetter, squash } from "./normalize";
import { isMonthDayFormat } from "./periods";

export type Cell = {
  row: number;
  column: number;
  ref: string;
  /** Raw stored value, unchanged. */
  raw: unknown;
  /** What Excel shows on screen. */
  display: string;
  numberFormat: string;
  /** ARGB hex, or "theme:<n>" when the fill uses a theme colour. */
  color: string | null;
  isDate: boolean;
};

export type SheetGrid = {
  name: string;
  /** Sheet name with surrounding whitespace removed. */
  trimmedName: string;
  rows: number;
  columns: number;
  cell(row: number, column: number): Cell;
  rowValues(row: number): string[];
  isBlankRow(row: number): boolean;
};

export type WorkbookGrid = {
  name: string;
  sheetNames: string[];
  sheet(name: string): SheetGrid | null;
  sheets(): SheetGrid[];
};

type RawCell = { v?: unknown; w?: string; z?: string; t?: string; s?: { patternType?: string; fgColor?: { rgb?: string; theme?: number; tint?: number } } };

function colorKey(cell: RawCell | undefined): string | null {
  const style = cell?.s;
  if (!style || !style.patternType || style.patternType === "none") return null;
  const fg = style.fgColor;
  if (!fg) return null;
  if (typeof fg.rgb === "string" && fg.rgb) return `#${fg.rgb.slice(-6).toUpperCase()}`;
  if (typeof fg.theme === "number") {
    const tint = typeof fg.tint === "number" ? Number(fg.tint.toFixed(2)) : 0;
    return `theme:${fg.theme}/${tint}`;
  }
  return null;
}

function dateDisplay(value: Date, format: string): string {
  const month = value.getUTCMonth() + 1;
  const day = value.getUTCDate();
  if (isMonthDayFormat(format)) return `${month}-${day}`;
  return `${month}-${day}`;
}

export async function readWorkbook(file: { name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<WorkbookGrid> {
  const buffer = await file.arrayBuffer();
  return gridFromBuffer(file.name, buffer);
}

export function gridFromBuffer(name: string, buffer: ArrayBuffer | Uint8Array): WorkbookGrid {
  const wb = XLSX.read(buffer, { cellStyles: true, cellDates: true, cellNF: true, cellText: true });
  return gridFromSheetJs(name, wb);
}

export function gridFromSheetJs(name: string, wb: XLSX.WorkBook): WorkbookGrid {
  const sheetCache = new Map<string, SheetGrid>();

  function build(sheetName: string): SheetGrid | null {
    const ws = wb.Sheets[sheetName];
    if (!ws) return null;
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
    const rows = range.e.r + 1;
    const columns = range.e.c + 1;
    const cell = (row: number, column: number): Cell => {
      const ref = `${columnLetter(column)}${row}`;
      const raw = ws[ref] as RawCell | undefined;
      const value = raw?.v;
      const numberFormat = raw?.z ? String(raw.z) : "General";
      const isDate = value instanceof Date;
      let display = "";
      if (raw) {
        if (typeof raw.w === "string" && raw.w !== "") display = squash(raw.w);
        else if (isDate) display = dateDisplay(value as Date, numberFormat);
        else display = squash(value);
      }
      return {
        row,
        column,
        ref,
        raw: value ?? null,
        display,
        numberFormat,
        color: colorKey(raw),
        isDate,
      };
    };
    const rowValues = (row: number) => {
      const out: string[] = [];
      for (let c = 1; c <= columns; c += 1) out.push(cell(row, c).display);
      return out;
    };
    return {
      name: sheetName,
      trimmedName: squash(sheetName),
      rows,
      columns,
      cell,
      rowValues,
      isBlankRow: (row: number) => rowValues(row).every((v) => v === ""),
    };
  }

  return {
    name,
    sheetNames: wb.SheetNames.slice(),
    sheet(sheetName: string) {
      const exact = wb.SheetNames.find((n) => n === sheetName) ?? wb.SheetNames.find((n) => squash(n) === squash(sheetName));
      if (!exact) return null;
      if (!sheetCache.has(exact)) {
        const built = build(exact);
        if (!built) return null;
        sheetCache.set(exact, built);
      }
      return sheetCache.get(exact) ?? null;
    },
    sheets() {
      return wb.SheetNames.map((n) => this.sheet(n)).filter((s): s is SheetGrid => Boolean(s));
    },
  };
}
