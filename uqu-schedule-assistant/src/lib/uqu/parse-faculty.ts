/**
 * Parser for the اعضاء التدريس roster sheet.
 *
 * The sheet is grouped by job title with subtotal rows between groups, then a
 * second header introduces external and cooperating members. The workbook has
 * no stable identifiers and repeats some display names, so identities are
 * derived from the roster row and never merged by name.
 */

import type { SourceRef } from "../types";
import { columnLetter, FACULTY_HEADERS, foldArabic, mapHeaderRow, squash } from "./normalize";
import type { SheetGrid } from "./workbook";

export type ParsedFacultyRow = {
  id: string;
  ref: SourceRef;
  name: string;
  jobTitle: string;
  affiliation: string;
  external: boolean;
  normalLoad: number | null;
  preparatory: number | null;
  additional: number | null;
  regular: number | null;
  /** Total as written in the workbook, when present. */
  totalInFile: number | null;
  /** Preparatory + additional + regular, computed here. */
  totalComputed: number;
  raw: Record<string, string>;
};

export type FacultyParseResult = {
  workbook: string;
  sheet: string;
  rows: ParsedFacultyRow[];
  internal: number;
  external: number;
  subtotalRows: number[];
  blankRows: number;
  /** Display names used by more than one roster row. */
  duplicateNames: { name: string; rows: number[] }[];
  /** Rows whose written total disagrees with preparatory + additional + regular. */
  totalMismatches: { row: number; inFile: number; computed: number }[];
};

function num(value: string): number | null {
  const cleaned = squash(value).replace(/[٫،]/g, ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isHeader(values: string[]): boolean {
  return values.some((v) => foldArabic(v) === foldArabic("الاسم")) && values.some((v) => foldArabic(v) === foldArabic("المسمى الوظيفي"));
}

/** Marks the header that starts the external / cooperating block. */
function isExternalHeader(values: string[]): boolean {
  return values.some((v) => /خارج المعهد/.test(foldArabic(v)) || /الكليه-تعاون/.test(foldArabic(v)));
}

export function parseFacultySheet(workbook: string, grid: SheetGrid): FacultyParseResult {
  const rows: ParsedFacultyRow[] = [];
  const subtotalRows: number[] = [];
  let blankRows = 0;
  let columns: Record<string, number> = {};
  let external = false;
  let groupLabel = "";

  for (let r = 1; r <= grid.rows; r += 1) {
    const values = grid.rowValues(r);
    if (values.every((v) => v === "")) {
      blankRows += 1;
      continue;
    }
    if (isHeader(values)) {
      columns = mapHeaderRow(values, FACULTY_HEADERS);
      external = isExternalHeader(values);
      continue;
    }
    if (!columns.name) continue;

    const name = grid.cell(r, columns.name).display;
    const jobTitle = columns.jobTitle ? grid.cell(r, columns.jobTitle).display : "";
    const affiliationCell = columns.groupIndex ? grid.cell(r, columns.groupIndex).display : "";

    // Subtotal rows carry numbers with no name. Trailing label columns to the
    // right of the table are group captions, not people.
    if (!name) {
      const hasNumbers = values.some((v) => v !== "" && Number.isFinite(Number(v)));
      if (hasNumbers) subtotalRows.push(r);
      const label = values.slice(Object.keys(columns).length).find((v) => v && !Number.isFinite(Number(v)));
      if (label) groupLabel = label;
      continue;
    }

    const normalLoad = columns.normalLoad ? num(grid.cell(r, columns.normalLoad).display) : null;
    const preparatory = columns.preparatory ? num(grid.cell(r, columns.preparatory).display) : null;
    const additional = columns.additional ? num(grid.cell(r, columns.additional).display) : null;
    const regular = columns.regular ? num(grid.cell(r, columns.regular).display) : null;
    const totalInFile = columns.total ? num(grid.cell(r, columns.total).display) : null;
    const totalComputed = (preparatory ?? 0) + (additional ?? 0) + (regular ?? 0);

    rows.push({
      // Identity comes from the workbook origin and the roster row, so two
      // people who share a display name still get separate records.
      id: `UQU-${grid.trimmedName.replace(/\s+/g, "_")}-R${r}`,
      ref: { workbook, sheet: grid.name, row: r, column: columnLetter(columns.name) },
      name,
      jobTitle,
      affiliation: external ? affiliationCell || groupLabel : groupLabel || jobTitle,
      external,
      normalLoad,
      preparatory,
      additional,
      regular,
      totalInFile,
      totalComputed,
      raw: {
        name,
        jobTitle,
        affiliation: affiliationCell,
        normalLoad: String(normalLoad ?? ""),
        preparatory: String(preparatory ?? ""),
        additional: String(additional ?? ""),
        regular: String(regular ?? ""),
        total: String(totalInFile ?? ""),
      },
    });
  }

  const byName = new Map<string, number[]>();
  for (const row of rows) {
    const key = foldArabic(row.name);
    byName.set(key, [...(byName.get(key) ?? []), row.ref.row]);
  }

  return {
    workbook,
    sheet: grid.name,
    rows,
    internal: rows.filter((r) => !r.external).length,
    external: rows.filter((r) => r.external).length,
    subtotalRows,
    blankRows,
    duplicateNames: [...byName.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([key, list]) => ({ name: rows.find((r) => foldArabic(r.name) === key)?.name ?? key, rows: list })),
    totalMismatches: rows
      .filter((r) => r.totalInFile !== null && r.totalInFile !== r.totalComputed)
      .map((r) => ({ row: r.ref.row, inFile: r.totalInFile as number, computed: r.totalComputed })),
  };
}
