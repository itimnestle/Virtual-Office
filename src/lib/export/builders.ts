import "server-only";
import type { DirectoryRow } from "@/lib/data/tasks";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { rankPeople, type Report } from "@/lib/reports";
import { formatBangkok } from "@/lib/time";
import type { ExportTable } from "./formats";

type Named = Map<string, string>;

/**
 * Task export from task_directory/search_tasks rows. A private task the viewer
 * cannot open is exported exactly as the UI shows it: its title and a marker,
 * every other column empty.
 */
export function buildTaskExport(
  rows: DirectoryRow[],
  ctx: { people: Named; categories: Named; tags: Named; t: Dictionary; locale: Locale; subtitle: string },
): ExportTable {
  const { t, locale } = ctx;
  return {
    title: t.reports.exportTasksTitle,
    subtitle: ctx.subtitle,
    notes: [t.reports.exportPrivacyNote],
    columns: [
      { key: "title", label: t.tasks.taskTitle, width: 34 },
      { key: "status", label: t.tasks.status, width: 14 },
      { key: "priority", label: t.tasks.priority, width: 10 },
      { key: "urgent", label: t.badges.urgent, width: 8 },
      { key: "category", label: t.extras.category, width: 14 },
      { key: "tags", label: t.extras.tags, width: 16 },
      { key: "assignees", label: t.tasks.assignees, width: 24 },
      { key: "due", label: t.tasks.dueCol, width: 18 },
      { key: "size", label: t.tasks.size, width: 7 },
      { key: "hours", label: t.tasks.estimatedHours, width: 9 },
      { key: "archived", label: t.reports.archived, width: 10 },
    ],
    rows: rows.map((r) =>
      r.redacted
        ? { title: r.title, status: `🔒 ${t.badges.private}`, priority: "", urgent: "", category: "", tags: "", assignees: "", due: "", size: "", hours: null, archived: "" }
        : {
            title: r.title,
            status: r.status ? t.status[r.status] : "",
            priority: r.priority ? t.priority[r.priority] : "",
            urgent: r.is_urgent ? "✓" : "",
            category: r.category_id ? (ctx.categories.get(r.category_id) ?? "") : "",
            tags: (r.tag_ids ?? []).map((id) => ctx.tags.get(id)).filter(Boolean).join(", "),
            assignees: (r.assignee_ids ?? []).map((id) => ctx.people.get(id) ?? "?").join(", "),
            due: r.due_at ? formatBangkok(r.due_at, locale) : "",
            size: r.size ? t.size[r.size] : "",
            hours: r.estimated_hours === null ? null : Number(r.estimated_hours),
            archived: r.archived_at ? "✓" : "",
          },
    ),
  };
}

/** Report export: per-person statistics; the rank column only for Admins. */
export function buildReportExport(report: Report, ctx: { t: Dictionary; subtitle: string; includeRanking: boolean }): ExportTable {
  const { t } = ctx;
  const people = ctx.includeRanking ? rankPeople(report.byPerson) : report.byPerson.map((p) => ({ ...p, rank: null as number | null }));
  const tile = report.tiles;
  return {
    title: t.reports.exportReportTitle,
    subtitle: ctx.subtitle,
    notes: [
      `${t.reports.tiles.open}: ${tile.open} · ${t.reports.tiles.completed}: ${tile.completed} · ${t.reports.tiles.overdue}: ${tile.overdue} · ${t.reports.tiles.onTimeRate}: ${tile.onTimeRate ?? "—"}${tile.onTimeRate === null ? "" : "%"} · ${t.reports.tiles.openHours}: ${tile.openHours}`,
      t.reports.scopeNote,
    ],
    columns: [
      ...(ctx.includeRanking ? [{ key: "rank", label: t.reports.rank, width: 6 }] : []),
      { key: "name", label: t.reports.person, width: 26 },
      { key: "open", label: t.reports.cols.open, width: 9 },
      { key: "inReview", label: t.reports.cols.inReview, width: 9 },
      { key: "overdue", label: t.reports.cols.overdue, width: 9 },
      { key: "completed", label: t.reports.cols.completed, width: 9 },
      { key: "onTime", label: t.reports.cols.onTime, width: 9 },
      { key: "late", label: t.reports.cols.late, width: 9 },
      { key: "openHours", label: t.reports.cols.openHours, width: 10 },
    ],
    rows: people.map((p) => ({
      rank: p.rank,
      name: p.name,
      open: p.open,
      inReview: p.inReview,
      overdue: p.overdue,
      completed: p.completed,
      onTime: p.onTime,
      late: p.late,
      openHours: p.openHours,
    })),
  };
}
