import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { getMeeting } from "@/lib/data/meetings";
import { displayName, getPeople } from "@/lib/data/tasks";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { formatBangkok } from "@/lib/time";
import { getAssignContext } from "../assign-support";
import { AssignItemForm, MeetingNotesForm } from "../meeting-forms";

export const metadata = { title: "Meeting" };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [meeting, people] = await Promise.all([getMeeting(supabase, id), getPeople(supabase)]);
  if (!meeting) notFound();

  const leads =
    viewer.role === "director" || viewer.role === "admin" || viewer.teams.some((v) => v.teamId === meeting.team_id && v.isLead);
  const isProxy = meeting.meeting_attendees.some((a) => a.user_id === viewer.id && a.is_proxy);
  const assign = leads ? await getAssignContext(supabase, viewer, t) : null;
  const tone = { unassigned: "warning", assigned: "ok", dismissed: "neutral" } as const;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/meetings" className="text-sm text-primary hover:underline">
        ← {t.meetings.back}
      </Link>
      <Card className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">{meeting.title}</h1>
        <p className="text-sm text-muted">
          {formatBangkok(meeting.starts_at, viewer.locale)} – {formatBangkok(meeting.ends_at, viewer.locale)}
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-muted">{t.meetings.attendees}:</span>
          {meeting.meeting_attendees.map((a) => (
            <span key={a.user_id}>
              {displayName(people.get(a.user_id))}
              {a.is_proxy ? <span className="text-xs text-muted"> ({t.meetings.proxy})</span> : null}
            </span>
          ))}
        </div>
        {meeting.summary ? <p className="rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-wrap">{meeting.summary}</p> : null}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.meetings.items}</h2>
        <ul className="flex flex-col gap-4">
          {meeting.meeting_action_items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 border-b border-border pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.title}</span>
                <Badge tone={tone[item.status]}>{t.meetings.status[item.status]}</Badge>
                {item.task_id ? (
                  <Link href={`/tasks/${item.task_id}`} className="text-sm text-primary hover:underline">
                    {t.meetings.openTask} →
                  </Link>
                ) : null}
              </div>
              {assign && item.status === "unassigned" ? (
                <AssignItemForm
                  itemId={item.id}
                  teamId={meeting.team_id}
                  candidates={assign.candidatesByTeam.get(meeting.team_id) ?? []}
                  canUrgent={assign.canUrgent}
                  skills={assign.skills}
                  suggestLabels={assign.suggestLabels}
                  labels={assign.labels}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {leads || isProxy ? (
        <Card>
          <h2 className="mb-3 font-semibold">{t.meetings.addNotes}</h2>
          <MeetingNotesForm
            meetingId={meeting.id}
            labels={{ note: t.meetings.note, items: t.meetings.addItems, submit: t.meetings.submitNotes, pending: t.common.loading }}
          />
        </Card>
      ) : null}
    </div>
  );
}
