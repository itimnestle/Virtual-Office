import { Artwork } from "@/components/artwork";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { requireViewer } from "@/lib/auth/session";
import { eachDay, isDateString, isoWeekday, shiftAnchor, viewRange, type CalendarView } from "@/lib/calendar";
import { displayName, getPeople, getTaskDirectory } from "@/lib/data/tasks";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { bangkokDate, formatBangkok } from "@/lib/time";
import { addLeaveAction, removeLeaveAction } from "./actions";

export const metadata = { title: "Calendar" };

type Params = { view?: string; date?: string; scope?: string; person?: string; category?: string };

type DayItem = { kind: "due" | "leave" | "meeting" | "holiday"; label: string; href?: string; tone?: "danger" | "warning" | "primary" | "neutral" | "ok" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const sp = await searchParams;
  const view: CalendarView = sp.view === "today" || sp.view === "month" ? sp.view : "week";
  const today = bangkokDate();
  const anchor = isDateString(sp.date) ? sp.date : today;
  const scope = sp.scope === "mine" ? "mine" : "team";
  const person = sp.person && /^[0-9a-f-]{36}$/i.test(sp.person) ? sp.person : null;
  const category = sp.category && /^[0-9a-f-]{36}$/i.test(sp.category) ? sp.category : null;
  const { from, to, focusMonth } = viewRange(view, anchor);

  const supabase = await createClient();
  const [rows, people, absences, meetings, holidays, categories, mine] = await Promise.all([
    getTaskDirectory(supabase),
    getPeople(supabase),
    supabase.rpc("absence_calendar", { p_from: from, p_to: to }),
    supabase
      .from("meetings")
      .select("id, title, starts_at, meeting_attendees(user_id)")
      .gte("starts_at", `${from}T00:00:00+07:00`)
      .lte("starts_at", `${to}T23:59:59+07:00`),
    supabase.from("company_holidays").select("holiday_on, name").gte("holiday_on", from).lte("holiday_on", to),
    supabase.from("task_categories").select("id, name_th, name_en").eq("is_active", true).order("sort_order"),
    supabase.from("member_absences").select("id, starts_on, ends_on, part, reason").eq("user_id", viewer.id).gte("ends_on", today).order("starts_on"),
  ]);

  const focusUser = scope === "mine" ? viewer.id : person;
  const items = new Map<string, DayItem[]>();
  const push = (d: string, item: DayItem) => items.set(d, [...(items.get(d) ?? []), item]);

  for (const h of holidays.data ?? []) push(h.holiday_on, { kind: "holiday", label: h.name, tone: "ok" });
  for (const r of rows) {
    if (r.redacted || !r.due_at || r.archived_at) continue;
    if (focusUser && !r.assignee_ids?.includes(focusUser)) continue;
    if (category && r.category_id !== category) continue;
    const d = bangkokDate(new Date(r.due_at));
    if (d < from || d > to) continue;
    push(d, {
      kind: "due",
      label: r.title,
      href: `/tasks/${r.id}`,
      tone: r.has_pending_extension ? "warning" : r.is_urgent ? "danger" : "primary",
    });
  }
  for (const a of absences.data ?? []) {
    if (focusUser && a.user_id !== focusUser) continue;
    for (const d of eachDay(a.starts_on < from ? from : a.starts_on, a.ends_on > to ? to : a.ends_on)) {
      const who = people.get(a.user_id);
      push(d, {
        kind: "leave",
        label: `${who?.nickname ?? who?.full_name ?? "?"}${a.part !== "full_day" ? ` (${t.calendar.parts[a.part]})` : ""}`,
        tone: "neutral",
      });
    }
  }
  if (!category) {
    for (const m of meetings.data ?? []) {
      if (focusUser && !m.meeting_attendees.some((x) => x.user_id === focusUser)) continue;
      push(bangkokDate(new Date(m.starts_at)), {
        kind: "meeting",
        label: `${formatBangkok(m.starts_at, viewer.locale).split(" ").pop()} ${m.title}`,
        href: `/meetings/${m.id}`,
        tone: "neutral",
      });
    }
  }

  const query = (patch: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged = { view, date: anchor, scope, person: person ?? undefined, category: category ?? undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/calendar?${p.toString()}`;
  };
  const days = eachDay(from, to);
  const tab = (active: boolean) => cn("rounded-full px-3 py-1.5 text-sm", active ? "bg-primary text-primary-fg" : "bg-surface-2");
  const staff = [...people.values()].filter((p) => p.is_active && p.role !== "admin");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t.calendar.title}</h1>

      <div className="flex flex-wrap items-center gap-2">
        {(["today", "week", "month"] as const).map((v) => (
          <Link key={v} href={query({ view: v, date: v === "today" ? today : anchor })} className={tab(view === v)}>
            {t.calendar[v]}
          </Link>
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        <Link href={query({ scope: "team" })} className={tab(scope === "team")}>
          {t.calendar.team}
        </Link>
        <Link href={query({ scope: "mine", person: undefined })} className={tab(scope === "mine")}>
          {t.calendar.mine}
        </Link>
        <span className="mx-1 h-6 w-px bg-border" />
        <Link href={query({ date: shiftAnchor(view, anchor, -1) })} className="rounded-lg px-2 py-1 text-sm hover:bg-surface-2" aria-label={t.calendar.prev}>
          ←
        </Link>
        <span className="text-sm font-medium">
          {view === "month" ? focusMonth : from === to ? from : `${from} – ${to}`}
        </span>
        <Link href={query({ date: shiftAnchor(view, anchor, 1) })} className="rounded-lg px-2 py-1 text-sm hover:bg-surface-2" aria-label={t.calendar.next}>
          →
        </Link>
      </div>

      <form method="get" action="/calendar" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="date" value={anchor} />
        <input type="hidden" name="scope" value={scope} />
        <Field label={t.calendar.person} htmlFor="c-person">
          <Select id="c-person" name="person" defaultValue={person ?? ""} disabled={scope === "mine"} className="min-w-44">
            <option value="">{t.calendar.all}</option>
            {staff.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.calendar.category} htmlFor="c-category">
          <Select id="c-category" name="category" defaultValue={category ?? ""} className="min-w-36">
            <option value="">{t.calendar.all}</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {viewer.locale === "th" ? c.name_th : c.name_en}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton variant="secondary" className="min-h-10">
          ✓
        </SubmitButton>
      </form>

      <div className={cn("grid gap-2", view === "month" ? "md:grid-cols-7" : view === "week" ? "md:grid-cols-7" : "")}>
        {days.map((d) => {
          const list = items.get(d) ?? [];
          const dim = focusMonth && !d.startsWith(focusMonth);
          const sunday = isoWeekday(d) === 7;
          return (
            <section
              key={d}
              aria-label={d}
              className={cn(
                "flex min-h-24 flex-col gap-1 rounded-xl border border-border bg-surface p-2",
                d === today && "border-primary ring-2 ring-[var(--ring)]",
                dim && "opacity-50",
                sunday && "bg-surface-2",
                view === "month" && list.length === 0 && "max-md:hidden",
              )}
            >
              <span className={cn("text-xs font-medium", sunday ? "text-danger" : "text-muted")}>
                {formatBangkok(`${d}T05:00:00Z`, viewer.locale, false)}
              </span>
              {list.length === 0 && view !== "month" ? <span className="text-xs text-muted">{t.calendar.empty}</span> : null}
              {list.map((item, i) =>
                item.href ? (
                  <Link key={i} href={item.href} className="truncate rounded-md hover:underline">
                    <Badge tone={item.tone}><Artwork name={item.kind === "holiday" ? "flag" : item.kind === "leave" ? "home" : item.kind === "meeting" ? "calendar" : "tasks"} size={16} className="mr-1 shrink-0" />{item.label}</Badge>
                  </Link>
                ) : (
                  <span key={i} className="truncate">
                    <Badge tone={item.tone}><Artwork name={item.kind === "holiday" ? "flag" : item.kind === "leave" ? "home" : item.kind === "meeting" ? "calendar" : "tasks"} size={16} className="mr-1 shrink-0" />{item.label}</Badge>
                  </span>
                ),
              )}
            </section>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">{t.calendar.addLeave}</h2>
          <ActionForm action={addLeaveAction} submitLabel={t.calendar.saveLeave}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t.calendar.startsOn} htmlFor="l-start">
                <Input id="l-start" name="startsOn" type="date" required defaultValue={today} />
              </Field>
              <Field label={t.calendar.endsOn} htmlFor="l-end">
                <Input id="l-end" name="endsOn" type="date" defaultValue={today} />
              </Field>
              <Field label={t.calendar.part} htmlFor="l-part">
                <Select id="l-part" name="part" defaultValue="full_day">
                  {(["full_day", "am", "pm"] as const).map((p) => (
                    <option key={p} value={p}>
                      {t.calendar.parts[p]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t.calendar.reason} htmlFor="l-reason">
              <Textarea id="l-reason" name="reason" rows={2} maxLength={1000} />
            </Field>
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">{t.calendar.myLeave}</h2>
          {(mine.data ?? []).length === 0 ? <p className="text-sm text-muted">{t.calendar.empty}</p> : null}
          <ul className="flex flex-col gap-2 text-sm">
            {(mine.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {a.starts_on}
                  {a.ends_on !== a.starts_on ? ` – ${a.ends_on}` : ""} · {t.calendar.parts[a.part]}
                  {a.reason ? <span className="text-muted"> · {a.reason}</span> : null}
                </span>
                <form action={removeLeaveAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton variant="ghost" className="min-h-8 px-2 text-xs text-danger">
                    {t.calendar.remove}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
