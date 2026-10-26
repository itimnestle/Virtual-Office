import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Viewer } from "@/lib/auth/session";
import { getOfficeSnapshot } from "@/lib/data/office";
import { format, type Dictionary } from "@/lib/i18n/dictionaries";
import type { Candidate } from "./meeting-forms";

/**
 * Assignment candidates per team with their current visible workload, taken
 * from the same office snapshot the 3D scene uses. The rule-based ranking is
 * fetched separately (suggest_assignees); the lead always decides.
 */
export async function getAssignContext(supabase: SupabaseClient<Database>, viewer: Viewer, t: Dictionary) {
  const [office, { data: memberships }, { data: skills }] = await Promise.all([
    getOfficeSnapshot(supabase),
    supabase.from("team_members").select("team_id, user_id"),
    supabase.from("skills").select("id, name_th, name_en").order("name_en"),
  ]);
  const byId = new Map(office.people.map((p) => [p.id, p]));
  const candidatesByTeam = new Map<string, Candidate[]>();
  for (const m of memberships ?? []) {
    const p = byId.get(m.user_id);
    if (!p || p.role === "director") continue;
    const list = candidatesByTeam.get(m.team_id) ?? [];
    list.push({
      id: p.id,
      name: p.nickname ? `${p.nickname} (${p.name})` : p.name,
      workload: format(t.inbox.openCount, { n: p.workload.open, h: p.workload.estimatedHours }),
      onLeave: p.location === "home",
    });
    candidatesByTeam.set(m.team_id, list);
  }
  return {
    candidatesByTeam,
    canUrgent: viewer.role !== "member",
    skills: (skills ?? []).map((s) => ({ id: s.id, name: viewer.locale === "th" ? s.name_th : s.name_en })),
    suggestLabels: t.suggest,
    labels: {
      assign: t.inbox.assign,
      pending: t.common.loading,
      due: t.tasks.due,
      priority: t.tasks.priority,
      size: t.tasks.size,
      hours: t.tasks.estimatedHours,
      private: t.tasks.private,
      urgent: t.tasks.urgent,
      onLeave: t.inbox.onLeave,
      none: t.tasks.none,
      priorities: t.priority,
    },
  };
}
