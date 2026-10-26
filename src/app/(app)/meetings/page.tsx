import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { getMeetings } from "@/lib/data/meetings";
import { displayName, getPeople } from "@/lib/data/tasks";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { formatBangkok } from "@/lib/time";
import { CreateMeetingForm, type TeamPeople } from "./meeting-forms";

export const metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const supabase = await createClient();
  const [meetings, people, { data: teams }, { data: memberships }] = await Promise.all([
    getMeetings(supabase),
    getPeople(supabase),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("team_members").select("team_id, user_id"),
  ]);

  const orgLeader = viewer.role === "director" || viewer.role === "admin";
  const ledTeams: TeamPeople[] = (teams ?? [])
    .filter((tm) => orgLeader || viewer.teams.some((v) => v.teamId === tm.id && v.isLead))
    .map((tm) => ({
      id: tm.id,
      name: tm.name,
      members: (memberships ?? [])
        .filter((m) => m.team_id === tm.id && people.get(m.user_id)?.is_active)
        .map((m) => ({ id: m.user_id, name: displayName(people.get(m.user_id)) })),
    }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t.meetings.title}</h1>
      {ledTeams.length ? (
        <Card>
          <details>
            <summary className="cursor-pointer text-base font-semibold">{t.meetings.create}</summary>
            <div className="pt-4">
              <CreateMeetingForm
                teams={ledTeams}
                viewerId={viewer.id}
                labels={{
                  title: t.meetings.meetingTitle,
                  team: t.admin.team,
                  startsAt: t.meetings.startsAt,
                  endsAt: t.meetings.endsAt,
                  summary: t.meetings.summary,
                  attendees: t.meetings.attendees,
                  proxy: t.meetings.proxy,
                  proxyHint: t.meetings.proxyHint,
                  actionItems: t.meetings.actionItems,
                  save: t.meetings.save,
                  pending: t.common.loading,
                }}
              />
            </div>
          </details>
        </Card>
      ) : null}
      {meetings.length === 0 ? (
        <EmptyState>{t.meetings.empty}</EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {meetings.map((m) => (
            <li key={m.id}>
              <Link href={`/meetings/${m.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium">{m.title}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {formatBangkok(m.starts_at, viewer.locale)} – {formatBangkok(m.ends_at, viewer.locale)}
                  {m.unassigned ? (
                    <Badge tone="warning">
                      {t.meetings.status.unassigned} {m.unassigned}/{m.total}
                    </Badge>
                  ) : m.total ? (
                    <Badge tone="ok">
                      {t.meetings.status.assigned} {m.total}
                    </Badge>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
