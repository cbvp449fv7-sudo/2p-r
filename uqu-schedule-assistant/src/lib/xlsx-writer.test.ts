import { describe, expect, it } from "vitest";
import * as XLSX from "@e965/xlsx";
import { buildWorkbook, columnName, safeSheetName } from "./xlsx-writer";
import { createZip, crc32, safeFilename } from "./zip";

describe("workbook writer", () => {
  it("names columns", () => {
    expect(columnName(1)).toBe("A");
    expect(columnName(26)).toBe("Z");
    expect(columnName(27)).toBe("AA");
    expect(columnName(28)).toBe("AB");
  });

  it("keeps sheet names legal and unique", () => {
    const taken = new Set<string>();
    expect(safeSheetName("الجدول الموحد", taken)).toBe("الجدول الموحد");
    expect(safeSheetName("الجدول الموحد", taken)).toBe("الجدول الموحد 2");
    expect(safeSheetName("a/b:c*d?e[f]", taken)).toBe("a b c d e f");
  });

  it("round-trips Arabic content through a real reader", () => {
    const bytes = buildWorkbook({
      rtl: true,
      title: "اختبار",
      sheets: [
        {
          name: "ملخص",
          rows: [
            ["الكلية", "عدد الشعب"],
            ["كلية تجريبية", 12],
          ],
          columnWidths: [24, 12],
          freezeHeader: true,
          filter: true,
          printArea: true,
        },
        { name: "ملاحظات", rows: [["ملاحظة"], ["عن بُعد"]] },
      ],
    });
    const wb = XLSX.read(bytes, { type: "array" });
    expect(wb.SheetNames).toEqual(["ملخص", "ملاحظات"]);
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["ملخص"], { header: 1 });
    expect(rows[0]).toEqual(["الكلية", "عدد الشعب"]);
    expect(rows[1]).toEqual(["كلية تجريبية", 12]);
    expect(XLSX.utils.sheet_to_json<string[]>(wb.Sheets["ملاحظات"], { header: 1 })[1]).toEqual(["عن بُعد"]);
  });

  it("writes right-to-left views, frozen headers, filters, and print areas", () => {
    const bytes = buildWorkbook({
      rtl: true,
      sheets: [{ name: "الجدول", rows: [["أ", "ب"], ["1", "2"]], freezeHeader: true, filter: true, printArea: true }],
    });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('rightToLeft="1"');
    expect(text).toContain('state="frozen"');
    expect(text).toContain("<autoFilter");
    expect(text).toContain("_xlnm.Print_Area");
  });

  it("escapes markup rather than emitting it", () => {
    const bytes = buildWorkbook({ sheets: [{ name: "s", rows: [["<b>&amp;</b>"]] }] });
    const wb = XLSX.read(bytes, { type: "array" });
    expect(XLSX.utils.sheet_to_json<string[]>(wb.Sheets.s, { header: 1 })[0][0]).toBe("<b>&amp;</b>");
  });
});

describe("zip writer", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("produces an archive a reader can open", () => {
    const inner = buildWorkbook({ sheets: [{ name: "s", rows: [["x"]] }] });
    const zip = createZip([{ name: "جداول_كلية.xlsx", data: inner }]);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    // The end-of-central-directory record closes the archive.
    expect(Array.from(zip.slice(-22, -18))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it("keeps Arabic in filenames but removes unsafe characters", () => {
    expect(safeFilename("جداول كلية الهندسة 1448 الإصدار 3")).toBe("جداول_كلية_الهندسة_1448_الإصدار_3");
    expect(safeFilename("a/b:c*d?e|f")).toBe("abcdef");
  });
});
