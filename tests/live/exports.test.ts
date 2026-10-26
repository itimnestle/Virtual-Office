/**
 * Milestone E live checks: exports built from real, RLS-scoped data. A member's
 * export must never contain another person's private task details, and only
 * the Admin's report export carries the ranking column.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import path from "node:path";
import ExcelJS from "exceljs";
import type { Database } from "@/lib/database.types";
import { getReportData } from "@/lib/data/reports";
import { displayName, getPeople, searchTasks } from "@/lib/data/tasks";
import { buildReportExport, buildTaskExport } from "@/lib/export/builders";
import { render } from "@/lib/export/formats";
import { getDictionary } from "@/lib/i18n/dictionaries";

try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env.local"));
} catch {
  /* env may come from the shell */
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

async function stackUp(): Promise<boolean> {
  if (!URL || !KEY) return false;
  try {
    return (await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY } })).ok;
  } catch {
    return false;
  }
}
const d = (await stackUp()) ? describe : describe.skip;
const t = getDictionary("th");

async function signIn(email: string): Promise<SupabaseClient<Database>> {
  const c = createClient<Database>(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "VirtualOffice2026" });
  if (error) throw new Error(error.message);
  return c;
}

async function taskTable(c: SupabaseClient<Database>) {
  const [rows, people] = await Promise.all([searchTasks(c, { includeArchived: true }), getPeople(c)]);
  return buildTaskExport(rows, {
    people: new Map([...people.values()].map((p) => [p.id, displayName(p)])),
    categories: new Map(),
    tags: new Map(),
    t,
    locale: "th",
    subtitle: "test",
  });
}

d("live: exports respect confidentiality", () => {
  it("a member's task export lists private titles only, in every format", async () => {
    const m1 = await signIn("member1@example.com");
    const table = await taskTable(m1);
    const priv = table.rows.find((r) => r.title === "ประเมินผลงานพนักงานทดลองงาน")!;
    expect(priv).toMatchObject({ status: `🔒 ${t.badges.private}`, assignees: "", due: "", hours: null });

    for (const format of ["csv", "xlsx", "pdf"] as const) {
      const { body } = await render(table, format);
      if (format === "csv") {
        const csv = body.toString("utf8");
        expect(csv).not.toContain("CONFIDENTIAL");
        expect(csv).not.toContain("Nok Member"); // the private task's assignee
        expect(csv).toContain("ประเมินผลงานพนักงานทดลองงาน");
      }
      if (format === "xlsx") {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(body as unknown as ArrayBuffer);
        const values = JSON.stringify(wb.worksheets[0].getSheetValues());
        expect(values).not.toContain("CONFIDENTIAL");
      }
      if (format === "pdf") expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    }
  });

  it("the Manager's export includes the private task details they may open", async () => {
    const manager = await signIn("manager@example.com");
    const table = await taskTable(manager);
    const priv = table.rows.find((r) => r.title === "ประเมินผลงานพนักงานทดลองงาน")!;
    expect(priv.assignees).toContain("นก");
    expect(priv.status).not.toContain("🔒");
  });

  it("only the Admin's report export has a rank column; exports are audited", async () => {
    const m1 = await signIn("member1@example.com");
    const admin = await signIn("admin@example.com");
    const memberReport = buildReportExport((await getReportData(m1, { period: "90d" })).report, { t, subtitle: "", includeRanking: false });
    const adminReport = buildReportExport((await getReportData(admin, { period: "90d" })).report, { t, subtitle: "", includeRanking: true });
    expect(memberReport.columns.map((c) => c.key)).not.toContain("rank");
    expect(adminReport.columns[0].key).toBe("rank");
    expect(adminReport.rows.length).toBeGreaterThanOrEqual(9); // Director, Manager, 7 members

    await m1.rpc("log_export", { p_kind: "report", p_format: "pdf", p_rows: memberReport.rows.length, p_filters: {} });
    const audit = await admin.from("admin_audit_logs").select("details").eq("action", "export").order("created_at", { ascending: false }).limit(1);
    expect(audit.data?.[0]?.details).toMatchObject({ kind: "report", format: "pdf" });
  });
});
