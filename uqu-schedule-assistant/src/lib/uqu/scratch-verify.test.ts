import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { gridFromBuffer } from "./workbook";
import { detectSheetRole } from "./normalize";
import { parseScheduleSheet } from "./parse-schedule";
import { parseFacultySheet } from "./parse-faculty";
import { parseRoomWorkbook } from "./parse-rooms";
import { compareSchedules, previewCounts } from "./compare";

const DIR = "/root/.claude/uploads/50c1e2fb-4683-5e5f-bb8e-811c2f8cbdd7";

describe("scratch verification", () => {
  it("faculty + rooms + comparison", () => {
    const wb = gridFromBuffer("schedule.xlsx", readFileSync(`${DIR}/f5edfe6c-_____________1448_1_1.xlsx`));
    const facSheet = wb.sheetNames.find((n) => detectSheetRole(n).role === "faculty")!;
    const fac = parseFacultySheet("schedule.xlsx", wb.sheet(facSheet)!);
    console.log("faculty", { total: fac.rows.length, internal: fac.internal, external: fac.external, subtotals: fac.subtotalRows.length, dupes: fac.duplicateNames.map((d) => d.rows), mismatches: fac.totalMismatches.length });
    console.log("titles", [...new Set(fac.rows.map((r) => r.jobTitle))]);
    console.log("sample mismatches", fac.totalMismatches.slice(0, 6));

    const orig = parseScheduleSheet("schedule.xlsx", wb.sheet("481")!);
    const rev = parseScheduleSheet("schedule.xlsx", wb.sheet("481 مراجعة")!);
    const cmp = compareSchedules(orig, rev);
    console.log("comparison", cmp.summary);
    console.log("preview original", previewCounts(cmp, "original"));
    console.log("preview reviewed", previewCounts(cmp, "reviewed"));
    console.log("preview merge", previewCounts(cmp, "merge"));

    const rw = gridFromBuffer("rooms.xlsx", readFileSync(`${DIR}/86d1c0b4-_____________.xlsx`));
    const rooms = parseRoomWorkbook("rooms.xlsx", rw);
    console.log("rooms", {
      total: rooms.rooms.length,
      withCapacity: rooms.rooms.filter((r) => r.capacity !== null).length,
      unknown: rooms.rooms.filter((r) => r.capacityUnknown).length,
      caps: [...new Set(rooms.rooms.map((r) => r.capacity))].sort(),
      groups: rooms.rooms.reduce<Record<string, number>>((a, r) => ({ ...a, [r.group]: (a[r.group] ?? 0) + 1 }), {}),
      maxGridPeriod: rooms.maxGridPeriod,
      colors: rooms.colors.length,
      entries: rooms.entries.length,
      textReservations: rooms.textReservations.map((t) => `${t.ref.sheet}!${t.ref.column}${t.ref.row}=${t.text} (${t.roomCode} p${t.period})`),
    });
    console.log("colors", rooms.colors.map((c) => `${c.color} x${c.count} ${c.samples[0]}`));
  });
});
