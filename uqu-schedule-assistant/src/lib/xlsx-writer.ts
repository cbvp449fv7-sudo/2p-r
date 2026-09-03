/**
 * Minimal OOXML workbook writer.
 *
 * The spreadsheet library the app reads with cannot write right-to-left sheet
 * views, frozen panes, or print areas, and every maintained alternative pulls a
 * large Node-oriented dependency tree into the browser bundle. The college
 * exports need all three, so the few kilobytes of XML they require are written
 * here instead.
 */

import { createZip, type ZipEntry } from "./zip";

export type CellValue = string | number | null;

export type SheetSpec = {
  /** Sheet tab name. Excel allows 31 characters and forbids a few symbols. */
  name: string;
  /** First row is treated as the header: bold, frozen, and filtered. */
  rows: CellValue[][];
  columnWidths?: number[];
  /** Adds an autofilter across the header row. */
  filter?: boolean;
  /** Freezes the header row so it stays visible while scrolling. */
  freezeHeader?: boolean;
  /** Sets the sheet's print area to the used range. */
  printArea?: boolean;
};

export type WorkbookSpec = {
  sheets: SheetSpec[];
  /** Renders every sheet right-to-left, for Arabic output. */
  rtl?: boolean;
  title?: string;
  creator?: string;
};

const FORBIDDEN_SHEET_CHARS = /[\\/?*[\]:]/g;

export function safeSheetName(name: string, taken: Set<string>): string {
  let base = name.replace(FORBIDDEN_SHEET_CHARS, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    const suffix = ` ${n}`;
    base = base.slice(0, 31 - suffix.length);
    candidate = `${base}${suffix}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Control characters other than tab, newline, and carriage return are not
    // legal in XML at all, so they are dropped rather than escaped.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

export function columnName(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text);

function sheetXml(sheet: SheetSpec, rtl: boolean): string {
  const rowCount = sheet.rows.length;
  const colCount = sheet.rows.reduce((n, r) => Math.max(n, r.length), 0);
  const dimension = rowCount && colCount ? `A1:${columnName(colCount)}${rowCount}` : "A1";

  const pane = sheet.freezeHeader && rowCount > 1 ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>` : "";
  const view = `<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ""}>${pane}</sheetView></sheetViews>`;

  const cols = sheet.columnWidths?.length
    ? `<cols>${sheet.columnWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";

  const rows = sheet.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => {
          if (value === null || value === undefined || value === "") return "";
          const ref = `${columnName(colIndex + 1)}${rowIndex + 1}`;
          const style = rowIndex === 0 ? ' s="1"' : "";
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}"${style}><v>${value}</v></c>`;
          }
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  const filter = sheet.filter && rowCount > 1 && colCount ? `<autoFilter ref="A1:${columnName(colCount)}${rowCount}"/>` : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/>${view}${cols}<sheetData>${rows}</sheetData>${filter}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1"/></worksheet>`;
}

export function buildWorkbook(spec: WorkbookSpec): Uint8Array {
  const taken = new Set<string>();
  const sheets = spec.sheets.map((sheet) => ({ ...sheet, name: safeSheetName(sheet.name, taken) }));

  const definedNames = sheets
    .map((sheet, index) => {
      if (!sheet.printArea) return "";
      const rowCount = sheet.rows.length;
      const colCount = sheet.rows.reduce((n, r) => Math.max(n, r.length), 0);
      if (!rowCount || !colCount) return "";
      const ref = `'${sheet.name.replace(/'/g, "''")}'!$A$1:$${columnName(colCount)}$${rowCount}`;
      return `<definedName name="_xlnm.Print_Area" localSheetId="${index}">${escapeXml(ref)}</definedName>`;
    })
    .join("");

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><sheets>${sheets
    .map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets>${definedNames ? `<definedNames>${definedNames}</definedNames>` : ""}</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join("")}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

  // Style 0 is the default; style 1 is the bold header used on the first row.
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(spec.title ?? "UQU Schedule")}</dc:title><dc:creator>${escapeXml(spec.creator ?? "UQU Schedule Assistant")}</dc:creator><cp:lastModifiedBy>${escapeXml(spec.creator ?? "UQU Schedule Assistant")}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>UQU Schedule Assistant</Application></Properties>`;

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: bytes(contentTypes) },
    { name: "_rels/.rels", data: bytes(rootRels) },
    { name: "docProps/core.xml", data: bytes(core) },
    { name: "docProps/app.xml", data: bytes(app) },
    { name: "xl/workbook.xml", data: bytes(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: bytes(workbookRels) },
    { name: "xl/styles.xml", data: bytes(styles) },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: bytes(sheetXml(sheet, Boolean(spec.rtl))) })),
  ];

  return createZip(entries);
}
