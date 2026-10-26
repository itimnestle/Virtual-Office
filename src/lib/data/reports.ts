import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getPeople } from "@/lib/data/tasks";
import { buildReport, buildTrend, periodRange, previousRange, statusMix, type Period, type Report, type ReportRow } from "@/lib/reports";
import { bangkokDate } from "@/lib/time";

type Client = SupabaseClient<Database>;
export type ReportParams = { period?: string; from?: string; to?: string };

const PERIODS: Period[] = ["7d", "30d", "90d", "month", "custom"];

/** One loader for the reports page and its exports, so both always agree. */
export async function getReportData(supabase: Client, params: ReportParams, now = new Date()) {
  const period: Period = PERIODS.find((p) => p === params.period) ?? "30d";
  const range = periodRange(period, bangkokDate(now), { from: params.from, to: params.to });
  const before = previousRange(range);
  const [{ data, error }, { data: prevData }, people, { data: categories }] = await Promise.all([
    supabase.rpc("report_tasks", { p_from: range.from, p_to: range.to }),
    supabase.rpc("report_tasks", { p_from: before.from, p_to: before.to }),
    getPeople(supabase),
    supabase.from("task_categories").select("id, name_th, name_en"),
  ]);
  if (error) throw new Error(`report_tasks failed: ${error.message}`);
  const staff = [...people.values()]
    .filter((p) => p.is_active && p.role !== "admin")
    .map((p) => ({ id: p.id, name: p.nickname ? `${p.nickname} (${p.full_name})` : p.full_name }));
  const rows = (data ?? []) as ReportRow[];
  const report: Report = buildReport(rows, staff, now);
  // The previous window is judged as of its own last day, so "overdue" means overdue back then.
  const previous = buildReport((prevData ?? []) as ReportRow[], staff, new Date(`${before.to}T23:59:59+07:00`));
  return { period, range, report, previous: previous.tiles, trend: buildTrend(rows, range), mix: statusMix(rows, now), categories: categories ?? [] };
}
