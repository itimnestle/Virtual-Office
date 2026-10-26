import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

/**
 * Export formats over one neutral table model. Content is whatever the caller
 * was authorized to read (built from RLS-scoped queries); this module only
 * renders it, and neutralizes spreadsheet formula injection in every format.
 */
export type ExportTable = {
  title: string;
  subtitle?: string;
  notes?: string[];
  columns: { key: string; label: string; width?: number }[];
  rows: Record<string, string | number | null>[];
};

/** Cells starting with = + - @ (or control chars) become literal text in spreadsheets. */
export function safeCell(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toCsv(table: ExportTable): Buffer {
  const quote = (v: string | number) => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    table.columns.map((c) => quote(safeCell(c.label))).join(","),
    ...table.rows.map((r) => table.columns.map((c) => quote(safeCell(r[c.key]))).join(",")),
  ];
  // BOM so Excel opens UTF-8 Thai text correctly.
  return Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8");
}

export async function toXlsx(table: ExportTable): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "3D Virtual Office";
  const ws = wb.addWorksheet(table.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  ws.columns = table.columns.map((c) => ({ header: String(safeCell(c.label)), key: c.key, width: c.width ?? 18 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of table.rows) {
    ws.addRow(Object.fromEntries(table.columns.map((c) => [c.key, safeCell(r[c.key])])));
  }
  if (table.notes?.length) {
    ws.addRow([]);
    for (const n of table.notes) ws.addRow([String(safeCell(n))]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const FONT_DIR = path.join(process.cwd(), "node_modules", "@expo-google-fonts", "sarabun");
let fonts: { regular: Buffer; bold: Buffer } | null = null;
function loadFonts() {
  // Sarabun (OFL) covers Thai and Latin; pdfkit applies its OpenType layout
  // so Thai vowels and tone marks are positioned correctly.
  fonts ??= {
    regular: readFileSync(path.join(FONT_DIR, "400Regular", "Sarabun_400Regular.ttf")),
    bold: readFileSync(path.join(FONT_DIR, "700Bold", "Sarabun_700Bold.ttf")),
  };
  return fonts;
}

export async function toPdf(table: ExportTable): Promise<Buffer> {
  const f = loadFonts();
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, font: f.regular as unknown as string, bufferPages: true });
  doc.registerFont("body", f.regular);
  doc.registerFont("bold", f.bold);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const weights = table.columns.map((c) => c.width ?? 18);
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / total) * usable);
  const pad = 4;

  doc.font("bold").fontSize(16).text(table.title);
  if (table.subtitle) doc.font("body").fontSize(10).fillColor("#52514e").text(table.subtitle).fillColor("#0b0b0b");
  for (const n of table.notes ?? []) doc.font("body").fontSize(9).fillColor("#52514e").text(n).fillColor("#0b0b0b");
  doc.moveDown(0.5);

  const drawRow = (cells: string[], bold: boolean) => {
    doc.font(bold ? "bold" : "body").fontSize(9);
    const height = Math.max(...cells.map((c, i) => doc.heightOfString(c || " ", { width: widths[i] - pad * 2 }))) + pad * 2;
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const y = doc.y;
    let x = left;
    if (bold) doc.rect(left, y, usable, height).fill("#f0efec").fillColor("#0b0b0b");
    cells.forEach((c, i) => {
      doc.font(bold ? "bold" : "body").fontSize(9).text(c, x + pad, y + pad, { width: widths[i] - pad * 2 });
      x += widths[i];
    });
    doc.moveTo(left, y + height).lineTo(left + usable, y + height).lineWidth(0.5).strokeColor("#e1e0d9").stroke();
    doc.x = left;
    doc.y = y + height;
  };

  drawRow(table.columns.map((c) => c.label), true);
  for (const r of table.rows) drawRow(table.columns.map((c) => String(r[c.key] ?? "")), false);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing below the bottom margin would make pdfkit open a new (blank) page.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("body").fontSize(8).fillColor("#898781")
      .text(`${i + 1} / ${range.count}`, left, doc.page.height - bottom + 12, { width: usable, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}

export async function render(table: ExportTable, format: "csv" | "xlsx" | "pdf"): Promise<{ body: Buffer; type: string; ext: string }> {
  if (format === "csv") return { body: toCsv(table), type: "text/csv; charset=utf-8", ext: "csv" };
  if (format === "xlsx") {
    return { body: await toXlsx(table), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
  }
  return { body: await toPdf(table), type: "application/pdf", ext: "pdf" };
}
