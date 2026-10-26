import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { getReportData } from "@/lib/data/reports";
import { displayName, getPeople, searchTasks, type TaskStatus } from "@/lib/data/tasks";
import { buildReportExport, buildTaskExport } from "@/lib/export/builders";
import { render } from "@/lib/export/formats";
import { format as fmt, getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/time";

/**
 * GET /api/export/tasks?format=csv|xlsx|pdf&<same filters as /tasks>
 * GET /api/export/report?format=csv|xlsx|pdf&period=…&from=…&to=…
 *
 * Runs entirely as the signed-in user (RLS + search_tasks/report_tasks), so an
 * export can never contain more than the screen shows. Every export is logged.
 */
const STATUSES: TaskStatus[] = ["not_started", "in_progress", "blocked", "in_review", "revision_required", "completed", "paused", "cancelled"];
const uuid = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const sp = request.nextUrl.searchParams;
  const format = sp.get("format");
  if ((kind !== "tasks" && kind !== "report") || (format !== "csv" && format !== "xlsx" && format !== "pdf")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Unauthorized", { status: 401 });
  const t = getDictionary(viewer.locale);
  const supabase = await createClient();

  let table;
  let filters: Record<string, unknown>;
  if (kind === "tasks") {
    const status = STATUSES.find((s) => s === sp.get("status"));
    const priority = (["low", "medium", "high"] as const).find((p) => p === sp.get("priority"));
    const search = {
      query: (sp.get("q") ?? "").trim().slice(0, 100) || undefined,
      statuses: status ? [status] : undefined,
      categoryId: uuid(sp.get("category")),
      tagId: uuid(sp.get("tag")),
      assigneeId: sp.get("view") === "mine" ? viewer.id : uuid(sp.get("assignee")),
      priority,
      urgentOnly: sp.get("urgent") === "1",
      includeArchived: sp.get("archived") === "1",
    };
    const [rows, people, { data: categories }, { data: tags }] = await Promise.all([
      searchTasks(supabase, search),
      getPeople(supabase),
      supabase.from("task_categories").select("id, name_th, name_en"),
      supabase.from("task_tags").select("id, name"),
    ]);
    table = buildTaskExport(rows, {
      people: new Map([...people.values()].map((p) => [p.id, displayName(p)])),
      categories: new Map((categories ?? []).map((c) => [c.id, viewer.locale === "th" ? c.name_th : c.name_en])),
      tags: new Map((tags ?? []).map((tg) => [tg.id, tg.name])),
      t,
      locale: viewer.locale,
      subtitle: `${bangkokDate()} · ${viewer.nickname ?? viewer.fullName}`,
    });
    filters = { ...search };
  } else {
    const data = await getReportData(supabase, { period: sp.get("period") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
    table = buildReportExport(data.report, {
      t,
      subtitle: fmt(t.reports.range, data.range),
      includeRanking: viewer.role === "admin",
    });
    filters = { period: data.period, ...data.range };
  }

  const out = await render(table, format);
  await supabase.rpc("log_export", { p_kind: kind, p_format: format, p_rows: table.rows.length, p_filters: filters as never });
  return new NextResponse(new Uint8Array(out.body), {
    headers: {
      "Content-Type": out.type,
      "Content-Disposition": `attachment; filename="${kind}-${bangkokDate()}.${out.ext}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
