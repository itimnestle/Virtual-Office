/**
 * Calendar date math on Bangkok calendar dates ("YYYY-MM-DD"). Dates are
 * treated as plain calendar days (computed in UTC), so no DST/offset issues.
 */
export type CalendarView = "today" | "week" | "month";

const MS_DAY = 86_400_000;

function toUtc(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDateString(v: string | undefined | null): v is string {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(toUtc(v)) && fromUtc(toUtc(v)) === v);
}

export function addDays(d: string, n: number): string {
  return fromUtc(toUtc(d) + n * MS_DAY);
}

/** ISO weekday 1 = Monday … 7 = Sunday. */
export function isoWeekday(d: string): number {
  const w = new Date(toUtc(d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export function startOfWeek(d: string): string {
  return addDays(d, 1 - isoWeekday(d));
}

export function addMonths(d: string, n: number): string {
  const [y, m] = d.split("-").map(Number);
  return fromUtc(Date.UTC(y, m - 1 + n, 1));
}

/** Inclusive date range shown for a view; month views pad to whole weeks. */
export function viewRange(view: CalendarView, anchor: string): { from: string; to: string; focusMonth: string | null } {
  if (view === "today") return { from: anchor, to: anchor, focusMonth: null };
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6), focusMonth: null };
  }
  const first = anchor.slice(0, 8) + "01";
  const last = addDays(addMonths(first, 1), -1);
  return { from: startOfWeek(first), to: addDays(startOfWeek(last), 6), focusMonth: anchor.slice(0, 7) };
}

export function shiftAnchor(view: CalendarView, anchor: string, dir: 1 | -1): string {
  if (view === "today") return addDays(anchor, dir);
  if (view === "week") return addDays(anchor, 7 * dir);
  return addMonths(anchor, dir);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
