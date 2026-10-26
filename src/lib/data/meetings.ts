import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;
export type ActionItemStatus = Database["public"]["Enums"]["action_item_status"];

export type MeetingListRow = {
  id: string;
  team_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  unassigned: number;
  total: number;
};

export async function getMeetings(supabase: Client): Promise<MeetingListRow[]> {
  const { data } = await supabase
    .from("meetings")
    .select("id, team_id, title, starts_at, ends_at, meeting_action_items(status)")
    .order("ends_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((m) => ({
    id: m.id,
    team_id: m.team_id,
    title: m.title,
    starts_at: m.starts_at,
    ends_at: m.ends_at,
    total: m.meeting_action_items.length,
    unassigned: m.meeting_action_items.filter((i) => i.status === "unassigned").length,
  }));
}

export async function getMeeting(supabase: Client, id: string) {
  const { data } = await supabase
    .from("meetings")
    .select(
      "id, team_id, title, starts_at, ends_at, summary, created_by, meeting_attendees(user_id, is_proxy), meeting_action_items(id, title, description, status, task_id, assigned_at, created_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  data.meeting_action_items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return data;
}

export type InboxItem = {
  id: string;
  title: string;
  meetingId: string;
  meetingTitle: string;
  teamId: string;
  endsAt: string;
  ageHours: number;
};

/** Unassigned action items the viewer can see, oldest meeting first. */
export async function getUnassignedInbox(supabase: Client, now = new Date()): Promise<InboxItem[]> {
  const { data } = await supabase
    .from("meeting_action_items")
    .select("id, title, created_at, meetings!inner(id, title, team_id, ends_at)")
    .eq("status", "unassigned")
    .order("created_at");
  return (data ?? [])
    .map((i) => ({
      id: i.id,
      title: i.title,
      meetingId: i.meetings.id,
      meetingTitle: i.meetings.title,
      teamId: i.meetings.team_id,
      endsAt: i.meetings.ends_at,
      ageHours: Math.max(0, Math.floor((now.getTime() - new Date(i.meetings.ends_at).getTime()) / 3_600_000)),
    }))
    .sort((a, b) => a.endsAt.localeCompare(b.endsAt));
}
