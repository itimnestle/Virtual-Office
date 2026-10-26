import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Card, EmptyState, cn } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { requireViewer } from "@/lib/auth/session";
import { format, getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { formatBangkok } from "@/lib/time";

export const metadata = { title: "Notifications" };

async function markAllRead() {
  "use server";
  await requireViewer();
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", {});
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, payload, task_id, meeting_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const items = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.notifications.title}</h1>
        {items.some((n) => !n.read_at) ? (
          <form action={markAllRead}>
            <SubmitButton variant="secondary">{t.notifications.markAll}</SubmitButton>
          </form>
        ) : null}
      </div>
      {items.length === 0 ? (
        <EmptyState>{t.notifications.empty}</EmptyState>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const p = (n.payload ?? {}) as Record<string, string>;
              const text = format(t.notifications.kinds[n.kind] ?? n.kind, {
                actor: p.actor_name ?? "",
                task: p.task_title ?? "",
                meeting: p.meeting_title ?? "",
                remaining: p.remaining ?? "",
                member: p.member_name ?? "",
                due: p.due_date ?? "",
                days: p.days_left ?? "",
                excerpt: p.excerpt ?? "",
              });
              const body = (
                <div className={cn("flex flex-col gap-0.5 px-4 py-3", !n.read_at && "bg-primary/5")}>
                  <span className={cn("text-sm", !n.read_at && "font-medium")}>{text}</span>
                  <span className="text-xs text-muted">{formatBangkok(n.created_at, viewer.locale)}</span>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.task_id || n.meeting_id ? (
                    <Link href={n.task_id ? `/tasks/${n.task_id}` : `/meetings/${n.meeting_id}`} className="block hover:bg-surface-2">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
