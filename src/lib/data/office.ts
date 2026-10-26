import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getTaskDirectory } from "@/lib/data/tasks";
import { deriveOfficeState, type OfficeInput, type OfficeState } from "@/lib/office/state";
import { bangkokDate } from "@/lib/time";

type Client = SupabaseClient<Database>;

/**
 * Everything the 3D office shows, read as the signed-in user. Uses the same
 * task_directory() as the dashboard, so 2D and 3D always agree.
 */
export async function getOfficeSnapshot(supabase: Client, now = new Date()): Promise<OfficeState> {
  const today = bangkokDate(now);
  const nowIso = now.toISOString();

  const [tasks, people, appearances, pets, absences, meetings, unassigned, statuses] = await Promise.all([
    getTaskDirectory(supabase),
    supabase.from("profiles").select("id, full_name, nickname, role, job_title, is_active"),
    supabase.from("avatar_appearance").select("user_id, skin, face, eyes, nose, mouth, hair, hair_color, top, bottom, shoes, glasses, accessory"),
    supabase.from("pets").select("user_id, species, breed, color, outfit, name, sound_enabled"),
    supabase.rpc("absence_calendar", { p_from: today, p_to: today }),
    supabase
      .from("meetings")
      .select("title, meeting_attendees(user_id)")
      .lte("starts_at", nowIso)
      .gte("ends_at", nowIso),
    supabase.from("meeting_action_items").select("id", { count: "exact", head: true }).eq("status", "unassigned"),
    supabase.from("office_status").select("user_id, status, note, until"),
  ]);

  const input: OfficeInput = {
    now,
    people: people.data ?? [],
    appearances: appearances.data ?? [],
    pets: (pets.data ?? []) as OfficeInput["pets"],
    tasks,
    absences: (absences.data ?? []) as OfficeInput["absences"],
    liveMeetings: (meetings.data ?? []).map((m) => ({
      title: m.title,
      attendeeIds: (m.meeting_attendees ?? []).map((a) => a.user_id),
    })),
    unassignedCount: unassigned.count ?? 0,
    statuses: statuses.data ?? [],
  };
  return deriveOfficeState(input);
}
