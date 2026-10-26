import Link from "next/link";
import { Card, cn } from "@/components/ui";
import { TaskCards } from "@/components/task-cards";
import { Artwork } from "@/components/artwork";
import { Icon } from "@/components/icon";
import "../../tasks-game.css";
import "../../reports-game.css";
import { requireViewer } from "@/lib/auth/session";
import { displayName, getPeople, searchTasks } from "@/lib/data/tasks";
import { format } from "@/lib/i18n/dictionaries";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { assignableScope } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { CreateTaskForm, type TeamOption } from "./create-task-form";

export const metadata = { title: "Tasks" };

type SearchParams = {
  view?: string;
  q?: string;
  status?: string;
  category?: string;
  tag?: string;
  assignee?: string;
  priority?: string;
  urgent?: string;
  archived?: string;
};

const STATUSES = ["not_started", "in_progress", "blocked", "in_review", "revision_required", "completed", "paused", "cancelled"] as const;
/** Request time, read once per render (kept out of the component body for purity). */
function nowMs() {
  return Date.now();
}
const isUuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const sp = await searchParams;
  const view = sp.view;
  const status = STATUSES.find((x) => x === sp.status);
  const priority = (["low", "medium", "high"] as const).find((x) => x === sp.priority);
  const filters = {
    query: (sp.q ?? "").trim().slice(0, 100) || undefined,
    statuses: status ? [status] : undefined,
    categoryId: isUuid(sp.category),
    tagId: isUuid(sp.tag),
    assigneeId: view === "mine" ? viewer.id : isUuid(sp.assignee),
    priority,
    urgentOnly: sp.urgent === "1",
    includeArchived: sp.archived === "1",
  };
  const supabase = await createClient();

  const [rows, doneRows, people, { data: teams }, { data: memberships }, { data: categories }] = await Promise.all([
    searchTasks(supabase, filters),
    // Finished work is archived (hidden by default), so "done" is counted with archived rows included.
    searchTasks(supabase, { ...filters, statuses: ["completed"], includeArchived: true }),
    getPeople(supabase),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("team_members").select("team_id, user_id"),
    supabase.from("task_categories").select("id, name_th, name_en").eq("is_active", true).order("sort_order"),
  ]);

  const orgWide = viewer.role === "director" || viewer.role === "admin";
  const teamOptions: TeamOption[] = (teams ?? [])
    .filter((tm) => orgWide || viewer.teams.some((v) => v.teamId === tm.id))
    .map((tm) => {
      const leads = orgWide || viewer.teams.some((v) => v.teamId === tm.id && v.isLead);
      return {
        id: tm.id,
        name: tm.name,
        scope: assignableScope(viewer.role, leads),
        members: (memberships ?? [])
          .filter((m) => m.team_id === tm.id && people.get(m.user_id)?.is_active)
          .map((m) => ({ id: m.user_id, name: displayName(people.get(m.user_id)) })),
      };
    });

  const { data: tagRows } = await supabase.from("task_tags").select("id, name, color, is_active").order("name");
  const shown = rows;
  // Same filters as the list, so the export matches the screen.
  const exportParams = Object.fromEntries(
    Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
  );

  const now = nowMs();
  const live = shown.filter((r) => !r.redacted);
  const isOpen = (r: (typeof shown)[number]) => r.status !== "completed" && r.status !== "cancelled" && !r.archived_at;
  const mine = view === "mine" ? "view=mine&" : "";
  const stats = [
    { key: "all", tone: "violet", icon: "tasks", value: shown.length, href: view === "mine" ? "/tasks?view=mine" : "/tasks", active: !status },
    { key: "active", tone: "blue", icon: "send", value: live.filter((r) => r.status === "in_progress").length, href: `/tasks?${mine}status=in_progress`, active: status === "in_progress" },
    { key: "review", tone: "amber", icon: "hourglass", value: live.filter((r) => r.status === "in_review").length, href: `/tasks?${mine}status=in_review`, active: status === "in_review" },
    { key: "overdue", tone: "red", icon: "alert", value: live.filter((r) => isOpen(r) && r.due_at && Date.parse(r.due_at) < now).length, href: null, active: false },
    { key: "done", tone: "green", icon: "check", value: doneRows.filter((r) => !r.redacted).length, href: `/tasks?${mine}status=completed&archived=1`, active: status === "completed" },
  ] as const;

  return (
    <div className="tasks-page flex flex-col gap-5">
      <header className="tasks-hero">
        <span className="tasks-hero-icon" aria-hidden><Artwork name="tasks" size={40} /></span>
        <div className="tasks-hero-text">
          <h1>{t.tasks.title}</h1>
          <p>{t.tasks.heroSubtitle}</p>
        </div>
        <div className="tasks-hero-art" aria-hidden><Artwork name="tasks" size={104} /></div>
        <div className="tasks-export">
          <span>{format(t.extras.results, { n: shown.length })} · {t.reports.exportTasks}:</span>
          {(["csv", "xlsx", "pdf"] as const).map((f) => (
            <a key={f} href={`/api/export/tasks?${new URLSearchParams({ ...exportParams, format: f }).toString()}`} className={`rpt-export-btn is-${f}`} download>
              <Icon name="download" size={15} />{f.toUpperCase()}
            </a>
          ))}
        </div>
      </header>

      <nav className="tasks-stats" aria-label={t.extras.status}>
        {stats.map((st) => {
          const body = <><span className="tasks-stat-icon" aria-hidden><Icon name={st.icon} size={18} /></span><span><small>{t.tasks.stats[st.key]}</small><strong>{st.value}</strong></span></>;
          return st.href
            ? <Link key={st.key} href={st.href} className={`tasks-stat is-${st.tone}`} aria-current={st.active ? "page" : undefined}>{body}</Link>
            : <div key={st.key} className={`tasks-stat is-${st.tone}`}>{body}</div>;
        })}
      </nav>

      {teamOptions.length ? (
        <Card>
          <details>
            <summary className="cursor-pointer text-base font-semibold">{t.tasks.create}</summary>
            <div className="pt-4">
              <CreateTaskForm
                teams={teamOptions}
                categories={(categories ?? []).map((c) => ({ id: c.id, name: viewer.locale === "th" ? c.name_th : c.name_en }))}
                viewerId={viewer.id}
                canMarkUrgent={viewer.role !== "member"}
                labels={{
                  title: t.tasks.taskTitle,
                  description: t.tasks.description,
                  assignees: t.tasks.assignees,
                  assigneesHint: t.tasks.assigneesHint,
                  priority: t.tasks.priority,
                  size: t.tasks.size,
                  estimatedHours: t.tasks.estimatedHours,
                  due: t.tasks.due,
                  private: t.tasks.private,
                  urgent: t.tasks.urgent,
                  category: t.tasks.category,
                  team: t.admin.team,
                  submit: t.tasks.create,
                  pending: t.common.loading,
                  none: t.tasks.none,
                  priorities: t.priority,
                }}
              />
            </div>
          </details>
        </Card>
      ) : null}

      <div className="flex gap-2" role="tablist">
        {[
          { key: "all", label: t.tasks.filterAll, href: "/tasks" },
          { key: "mine", label: t.tasks.filterMine, href: "/tasks?view=mine" },
        ].map((f) => {
          const active = (view === "mine" ? "mine" : "all") === f.key;
          return (
            <Link
              key={f.key}
              href={f.href}
              role="tab"
              aria-selected={active}
              className={cn("rounded-full px-3 py-1.5 text-sm", active ? "bg-primary text-primary-fg" : "bg-surface-2 text-text")}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <form method="get" action="/tasks" className="tasks-filters flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" role="search">
        {view === "mine" ? <input type="hidden" name="view" value="mine" /> : null}
        <div className="tasks-search flex flex-wrap gap-2">
          <Icon name="search" size={18} className="tasks-search-icon" />
          <Input
            name="q"
            type="search"
            defaultValue={filters.query ?? ""}
            maxLength={100}
            placeholder={t.extras.searchPlaceholder}
            aria-label={t.extras.search}
            className="min-w-56 flex-1"
          />
          <SubmitButton>{t.extras.search}</SubmitButton>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Field label={t.extras.status} htmlFor="f-status">
            <Select id="f-status" name="status" defaultValue={status ?? ""}>
              <option value="">{t.extras.any}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t.status[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.extras.priority} htmlFor="f-priority">
            <Select id="f-priority" name="priority" defaultValue={priority ?? ""}>
              <option value="">{t.extras.any}</option>
              {(["low", "medium", "high"] as const).map((p) => (
                <option key={p} value={p}>
                  {t.priority[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.extras.category} htmlFor="f-category">
            <Select id="f-category" name="category" defaultValue={filters.categoryId ?? ""}>
              <option value="">{t.extras.any}</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {viewer.locale === "th" ? c.name_th : c.name_en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.extras.tags} htmlFor="f-tag">
            <Select id="f-tag" name="tag" defaultValue={filters.tagId ?? ""}>
              <option value="">{t.extras.any}</option>
              {(tagRows ?? []).map((tg) => (
                <option key={tg.id} value={tg.id}>
                  #{tg.name}
                </option>
              ))}
            </Select>
          </Field>
          {view === "mine" ? null : (
            <Field label={t.extras.assignee} htmlFor="f-assignee">
              <Select id="f-assignee" name="assignee" defaultValue={filters.assigneeId ?? ""}>
                <option value="">{t.extras.any}</option>
                {[...people.values()]
                  .filter((p) => p.role !== "admin")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayName(p)}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="urgent" value="1" defaultChecked={filters.urgentOnly} /> {t.extras.urgentOnly}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="archived" value="1" defaultChecked={filters.includeArchived} /> {t.extras.includeArchived}
          </label>
          <a href={view === "mine" ? "/tasks?view=mine" : "/tasks"} className="text-primary hover:underline">
            {t.extras.clear}
          </a>
        </div>
        <p className="text-xs text-muted">{t.extras.searchNote}</p>
      </form>

      <TaskCards rows={shown} people={people} t={t} locale={viewer.locale} tags={tagRows ?? []} now={now} />
    </div>
  );
}
