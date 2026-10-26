import type { Database } from "@/lib/database.types";

/**
 * Pure report aggregation over public.report_tasks() rows. Rows only contain
 * tasks the viewer may open, so every figure is already authorization-scoped.
 * No percent-progress of individual tasks is computed (out of V1 scope); the
 * on-time rate is a team statistic over completed work with a due date.
 */

type Enums = Database["public"]["Enums"];
/** A row of public.report_tasks() (generated RPC types mark every column non-null). */
export type ReportRow = {
  id: string;
  team_id: string;
  category_id: string | null;
  status: Enums["task_status"];
  priority: Enums["task_priority"];
  size: Enums["task_size"] | null;
  is_urgent: boolean;
  is_private: boolean;
  estimated_hours: number | null;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
  archived_at: string | null;
  approved_submitted_at: string | null;
  assignee_ids: string[] | null;
};
export type TaskStatus = Enums["task_status"];

export const STATUS_ORDER: TaskStatus[] = [
  "not_started",
  "in_progress",
  "blocked",
  "in_review",
  "revision_required",
  "paused",
  "completed",
  "cancelled",
];
const OPEN: TaskStatus[] = ["not_started", "in_progress", "blocked", "in_review", "revision_required", "paused"];

export type Timeliness = "on_time" | "late" | "no_due" | "not_done";

/** On time = the approved submission was handed in by the due date. */
export function timeliness(row: Pick<ReportRow, "status" | "due_at" | "approved_submitted_at" | "completed_at">): Timeliness {
  if (row.status !== "completed") return "not_done";
  if (!row.due_at) return "no_due";
  const handedIn = row.approved_submitted_at ?? row.completed_at;
  if (!handedIn) return "no_due";
  return new Date(handedIn).getTime() <= new Date(row.due_at).getTime() ? "on_time" : "late";
}

export function isOpenRow(row: Pick<ReportRow, "status" | "archived_at">): boolean {
  return !row.archived_at && OPEN.includes(row.status);
}

export type PersonStats = {
  userId: string;
  name: string;
  open: number;
  inReview: number;
  completed: number;
  onTime: number;
  late: number;
  overdue: number;
  openHours: number;
};

export type Report = {
  tiles: {
    total: number;
    open: number;
    completed: number;
    inReview: number;
    overdue: number;
    onTime: number;
    late: number;
    /** 0..100, or null when no completed work had a due date. */
    onTimeRate: number | null;
    openHours: number;
    urgentOpen: number;
  };
  byStatus: { status: TaskStatus; count: number }[];
  byCategory: { categoryId: string | null; count: number; hours: number }[];
  byPerson: PersonStats[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildReport(rows: ReportRow[], people: { id: string; name: string }[], now = new Date()): Report {
  const t = now.getTime();
  const isOverdue = (r: ReportRow) => isOpenRow(r) && Boolean(r.due_at) && new Date(r.due_at!).getTime() < t;
  const open = rows.filter(isOpenRow);
  const done = rows.filter((r) => r.status === "completed");
  const onTime = done.filter((r) => timeliness(r) === "on_time").length;
  const late = done.filter((r) => timeliness(r) === "late").length;

  const categories = new Map<string | null, { count: number; hours: number }>();
  for (const r of rows) {
    const c = categories.get(r.category_id ?? null) ?? { count: 0, hours: 0 };
    c.count += 1;
    c.hours += Number(r.estimated_hours ?? 0);
    categories.set(r.category_id ?? null, c);
  }

  const stats = new Map<string, PersonStats>(
    people.map((p) => [p.id, { userId: p.id, name: p.name, open: 0, inReview: 0, completed: 0, onTime: 0, late: 0, overdue: 0, openHours: 0 }]),
  );
  for (const r of rows) {
    for (const uid of r.assignee_ids ?? []) {
      const s = stats.get(uid);
      if (!s) continue; // not a listed person (e.g. Admin) — not reported per person
      if (isOpenRow(r)) {
        s.open += 1;
        s.openHours += Number(r.estimated_hours ?? 0);
        if (r.status === "in_review") s.inReview += 1;
        if (isOverdue(r)) s.overdue += 1;
      }
      if (r.status === "completed") {
        s.completed += 1;
        const tl = timeliness(r);
        if (tl === "on_time") s.onTime += 1;
        if (tl === "late") s.late += 1;
      }
    }
  }

  return {
    tiles: {
      total: rows.length,
      open: open.length,
      completed: done.length,
      inReview: open.filter((r) => r.status === "in_review").length,
      overdue: rows.filter(isOverdue).length,
      onTime,
      late,
      onTimeRate: onTime + late ? Math.round((onTime / (onTime + late)) * 100) : null,
      openHours: round1(open.reduce((sum, r) => sum + Number(r.estimated_hours ?? 0), 0)),
      urgentOpen: open.filter((r) => r.is_urgent).length,
    },
    byStatus: STATUS_ORDER.map((status) => ({ status, count: rows.filter((r) => r.status === status).length })),
    byCategory: [...categories.entries()]
      .map(([categoryId, v]) => ({ categoryId, count: v.count, hours: round1(v.hours) }))
      .sort((a, b) => b.count - a.count),
    byPerson: [...stats.values()].map((s) => ({ ...s, openHours: round1(s.openHours) })),
  };
}

/**
 * Admin-only ranking (the Blueprint allows per-person statistics for everyone,
 * but the ranked table for Admin only). Order: more on-time completions, then
 * more completions, then fewer late, then fewer overdue.
 */
export function rankPeople(people: PersonStats[]): (PersonStats & { rank: number })[] {
  const sorted = [...people].sort(
    (a, b) => b.onTime - a.onTime || b.completed - a.completed || a.late - b.late || a.overdue - b.overdue || a.name.localeCompare(b.name),
  );
  let rank = 0;
  return sorted.map((p, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.onTime !== p.onTime || prev.completed !== p.completed || prev.late !== p.late || prev.overdue !== p.overdue) rank = i + 1;
    return { ...p, rank };
  });
}

export type Period = "7d" | "30d" | "90d" | "month" | "custom";

/** Bangkok calendar range for a period preset. */
export function periodRange(period: Period, today: string, custom?: { from?: string; to?: string }): { from: string; to: string } {
  const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  switch (period) {
    case "7d":
      return { from: shift(today, -6), to: today };
    case "90d":
      return { from: shift(today, -89), to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "custom": {
      const ok = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
      if (ok(custom?.from) && ok(custom?.to) && custom!.from! <= custom!.to!) {
        // Cap at two years (the DB function refuses longer windows).
        const from = custom!.from! < shift(custom!.to!, -730) ? shift(custom!.to!, -730) : custom!.from!;
        return { from, to: custom!.to! };
      }
      return { from: shift(today, -29), to: today };
    }
    default:
      return { from: shift(today, -29), to: today };
  }
}

/** The window of the same length right before `range` (for "vs previous period"). */
export function previousRange(range: { from: string; to: string }): { from: string; to: string } {
  const day = 86_400_000;
  const from = Date.parse(`${range.from}T00:00:00Z`);
  const to = Date.parse(`${range.to}T00:00:00Z`);
  const days = Math.round((to - from) / day) + 1;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(from - days * day), to: iso(from - day) };
}

/** Percentage change from `previous` to `current`; null when there is no base to compare with. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export type TrendDay = { date: string; created: number; completed: number; backlog: number; completedAvg: number };

/**
 * Daily activity in Bangkok dates: tasks created, tasks completed, and the
 * backlog still open at the end of each day (created by then and not yet
 * completed, cancelled or archived by then; cancellation without a timestamp
 * counts as closed from the start).
 */
export function buildTrend(rows: ReportRow[], range: { from: string; to: string }): TrendDay[] {
  const bkk = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);
  const days: TrendDay[] = [];
  for (let d = Date.parse(`${range.from}T00:00:00Z`); d <= Date.parse(`${range.to}T00:00:00Z`); d += 86_400_000) {
    days.push({ date: new Date(d).toISOString().slice(0, 10), created: 0, completed: 0, backlog: 0, completedAvg: 0 });
  }
  const index = new Map(days.map((d, i) => [d.date, i]));
  for (const r of rows) {
    const created = bkk(r.created_at);
    const closedAt = r.status === "completed" ? r.completed_at ?? r.archived_at : r.status === "cancelled" ? r.created_at : r.archived_at;
    const closed = closedAt ? bkk(closedAt) : null;
    const ci = index.get(created);
    if (ci !== undefined) days[ci].created += 1;
    if (r.status === "completed" && r.completed_at) {
      const di = index.get(bkk(r.completed_at));
      if (di !== undefined) days[di].completed += 1;
    }
    for (const day of days) if (created <= day.date && (!closed || closed > day.date)) day.backlog += 1;
  }
  // Trailing 7-day average of completions (fewer days at the start of the window).
  days.forEach((day, i) => {
    const span = days.slice(Math.max(0, i - 6), i + 1);
    day.completedAvg = Math.round((span.reduce((s, d) => s + d.completed, 0) / span.length) * 10) / 10;
  });
  return days;
}

export type StatusMix = { key: "open" | "inReview" | "overdue" | "completed"; count: number }[];

/** Four buckets for the status donut: each task counted once, overdue before in-review before open. */
export function statusMix(rows: ReportRow[], now = new Date()): StatusMix {
  const t = now.getTime();
  const mix = { open: 0, inReview: 0, overdue: 0, completed: 0 };
  for (const r of rows) {
    if (r.status === "completed") mix.completed += 1;
    else if (!isOpenRow(r)) continue;
    else if (r.due_at && new Date(r.due_at).getTime() < t) mix.overdue += 1;
    else if (r.status === "in_review") mix.inReview += 1;
    else mix.open += 1;
  }
  return (["open", "inReview", "overdue", "completed"] as const).map((key) => ({ key, count: mix[key] }));
}
