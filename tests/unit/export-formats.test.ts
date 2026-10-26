import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { safeCell, toCsv, toPdf, toXlsx, type ExportTable } from "@/lib/export/formats";

const table: ExportTable = {
  title: "งานทั้งหมด",
  subtitle: "ช่วง 2026-10-01 – 2026-10-24",
  notes: ["งานลับที่คุณไม่มีสิทธิ์ดู แสดงเฉพาะชื่อหัวข้อ"],
  columns: [
    { key: "title", label: "ชื่องาน", width: 30 },
    { key: "status", label: "สถานะ" },
    { key: "hours", label: "ชั่วโมง", width: 8 },
  ],
  rows: [
    { title: "เตรียมรายงานยอดขายไตรมาส 3, ภาคเหนือ", status: "กำลังทำ", hours: 12 },
    { title: '=HYPERLINK("http://evil","click")', status: "+cmd", hours: null },
    { title: 'ชื่อมี "อัญประกาศ"\nสองบรรทัด', status: "@SUM(A1)", hours: 1.5 },
  ],
};

describe("export formats", () => {
  it("neutralizes formula injection", () => {
    expect(safeCell("=1+1")).toBe("'=1+1");
    expect(safeCell("-2")).toBe("'-2");
    expect(safeCell("ปกติ")).toBe("ปกติ");
    expect(safeCell(-2)).toBe(-2); // real numbers stay numbers
  });

  it("CSV: UTF-8 BOM, RFC 4180 quoting, injection-safe", () => {
    const csv = toCsv(table).toString("utf8");
    expect(csv.startsWith("﻿ชื่องาน,สถานะ,ชั่วโมง\r\n")).toBe(true);
    expect(csv).toContain('"เตรียมรายงานยอดขายไตรมาส 3, ภาคเหนือ",กำลังทำ,12');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""click"")",'+cmd,`);
    expect(csv).toContain(`"ชื่อมี ""อัญประกาศ""\nสองบรรทัด",'@SUM(A1),1.5`);
  });

  it("XLSX: readable back, Thai intact, no formulas", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await toXlsx(table)) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getCell("A1").value).toBe("ชื่องาน");
    expect(ws.getCell("A2").value).toBe("เตรียมรายงานยอดขายไตรมาส 3, ภาคเหนือ");
    expect(ws.getCell("A3").value).toBe(`'=HYPERLINK("http://evil","click")`);
    expect(ws.getCell("C2").value).toBe(12);
    ws.eachRow((row) => row.eachCell((cell) => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)));
  });

  it("PDF: valid document with embedded Thai font", async () => {
    const pdf = await toPdf(table);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toMatch(/Sarabun/);
    // A short table fits on one page (no blank trailing page from the footer).
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
    // Saved for a visual check of Thai shaping.
    const out = path.resolve(__dirname, "../../.test-output");
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, "export-sample.pdf"), pdf);
  });
});
