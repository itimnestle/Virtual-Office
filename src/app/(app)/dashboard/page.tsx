import Link from "next/link";
import { Alert, Card } from "@/components/ui";
import { TaskList } from "@/components/task-list";
import { requireViewer } from "@/lib/auth/session";
import { getPeople, getTaskDirectory, isDueWithinDays, isOpen } from "@/lib/data/tasks";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Home" };

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <Card className="flex h-full flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-3xl font-semibold tabular-nums">{value}</span>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string; welcome?: string }> }) {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const params = await searchParams;
  const supabase = await createClient();

  const [rows, people, unassigned, unread] = await Promise.all([
    getTaskDirectory(supabase),
    getPeople(supabase),
    supabase.from("meeting_action_items").select("id", { count: "exact", head: true }).eq("status", "unassigned"),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);

  const mine = rows.filter((r) => isOpen(r) && r.assignee_ids?.includes(viewer.id));
  const open = rows.filter(isOpen);
  const stats: { label: string; value: number; href?: string }[] = [];

  if (viewer.role === "admin") {
    const [{ count: active }, { count: invites }] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("invites").select("id", { count: "exact", head: true }).is("accepted_at", null).is("revoked_at", null),
    ]);
    stats.push(
      { label: t.dashboard.users, value: active ?? 0, href: "/admin/users" },
      { label: t.dashboard.pendingInvites, value: invites ?? 0, href: "/admin/users" },
      { label: t.dashboard.teamOpen, value: open.length, href: "/tasks" },
    );
  } else if (viewer.role === "member") {
    stats.push(
      { label: t.dashboard.myOpen, value: mine.length, href: "/tasks?view=mine" },
      { label: t.dashboard.dueSoon, value: mine.filter((r) => isDueWithinDays(r, 7)).length },
      { label: t.dashboard.unread, value: unread.count ?? 0, href: "/notifications" },
    );
  } else {
    stats.push(
      { label: t.dashboard.teamOpen, value: open.length, href: "/tasks" },
      { label: t.dashboard.inReview, value: open.filter((r) => r.status === "in_review").length },
      { label: t.dashboard.dueSoon, value: open.filter((r) => isDueWithinDays(r, 7)).length },
      { label: t.dashboard.unassignedItems, value: unassigned.count ?? 0, href: "/inbox" },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {t.dashboard.hello}, {viewer.nickname ?? viewer.fullName}
        </h1>
        <p className="text-sm text-muted">{t.roles[viewer.role]}</p>
      </div>
      {params.denied ? <Alert>{t.common.forbidden}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.dashboard.myTasks}</h2>
        <TaskList rows={mine} people={people} t={t} locale={viewer.locale} />
      </section>
    </div>
  );
}
