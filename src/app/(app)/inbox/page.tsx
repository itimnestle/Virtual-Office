import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { requireViewer } from "@/lib/auth/session";
import { getUnassignedInbox } from "@/lib/data/meetings";
import { format, getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { formatBangkok } from "@/lib/time";
import { dismissItemAction } from "../meetings/actions";
import { getAssignContext } from "../meetings/assign-support";
import { AssignItemForm } from "../meetings/meeting-forms";

export const metadata = { title: "Unassigned inbox" };

export default async function InboxPage() {
  const viewer = await requireViewer(["director", "manager", "admin"]);
  const t = getDictionary(viewer.locale);
  const supabase = await createClient();
  const [items, assign] = await Promise.all([getUnassignedInbox(supabase), getAssignContext(supabase, viewer, t)]);

  const groups = new Map<string, typeof items>();
  for (const i of items) groups.set(i.meetingId, [...(groups.get(i.meetingId) ?? []), i]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.inbox.title}</h1>
        <p className="text-sm text-muted">{t.inbox.intro}</p>
      </div>
      <Card className="flex items-center justify-between">
        <span className="text-sm text-muted">{t.inbox.total}</span>
        <span className="text-3xl font-semibold tabular-nums" data-testid="unassigned-total">
          {items.length}
        </span>
      </Card>
      {items.length === 0 ? <EmptyState>{t.inbox.empty}</EmptyState> : null}
      {[...groups.values()].map((group) => {
        const first = group[0];
        return (
          <section key={first.meetingId} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/meetings/${first.meetingId}`} className="text-lg font-semibold hover:underline">
                {first.meetingTitle}
              </Link>
              <span className="text-xs text-muted">
                {t.meetings.ended} {formatBangkok(first.endsAt, viewer.locale)} ·{" "}
                <Badge tone={first.ageHours >= 24 ? "danger" : "warning"}>{format(t.inbox.age, { hours: first.ageHours })}</Badge>
              </span>
            </div>
            {group.map((item) => (
              <Card key={item.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium">{item.title}</h2>
                  <form action={dismissItemAction}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <SubmitButton variant="ghost" className="min-h-8 px-2 text-xs text-muted">
                      {t.inbox.dismiss}
                    </SubmitButton>
                  </form>
                </div>
                <p className="text-xs text-muted">{t.inbox.workload}</p>
                <AssignItemForm
                  itemId={item.id}
                  teamId={item.teamId}
                  candidates={assign.candidatesByTeam.get(item.teamId) ?? []}
                  canUrgent={assign.canUrgent}
                  skills={assign.skills}
                  suggestLabels={assign.suggestLabels}
                  labels={assign.labels}
                />
              </Card>
            ))}
          </section>
        );
      })}
    </div>
  );
}
