"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { errorKey, getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { bangkokLocalToUtcIso } from "@/lib/time";
import type { ActionState } from "@/components/form-bits";

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((l) => l.slice(0, 200));

const meetingForm = z.object({
  teamId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  startsAt: localDateTime,
  endsAt: localDateTime,
  summary: z.string().max(50000),
  attendees: z.array(z.uuid()).max(100),
  proxies: z.array(z.uuid()).max(100),
});

export async function createMeetingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const parsed = meetingForm.safeParse({
    teamId: formData.get("teamId"),
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    summary: String(formData.get("summary") ?? ""),
    attendees: formData.getAll("attendees").map(String),
    proxies: formData.getAll("proxies").map(String),
  });
  if (!parsed.success) return { error: t.errors.invalid_input };
  const f = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_meeting", {
    p_team_id: f.teamId,
    p_title: f.title,
    p_starts_at: bangkokLocalToUtcIso(f.startsAt),
    p_ends_at: bangkokLocalToUtcIso(f.endsAt),
    p_summary: f.summary,
    p_attendee_ids: f.attendees,
    p_proxy_ids: f.proxies,
    p_action_items: lines(formData.get("actionItems")),
  });
  if (error) return { error: t.errors[errorKey(error.message)] ?? t.errors.generic };
  revalidatePath("/meetings");
  revalidatePath("/inbox");
  redirect(`/meetings/${data}`);
}

export async function addMeetingNotesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const meetingId = z.uuid().safeParse(formData.get("meetingId"));
  if (!meetingId.success) return { error: t.errors.invalid_input };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_meeting_notes", {
    p_meeting_id: meetingId.data,
    p_note: String(formData.get("note") ?? "").slice(0, 10000),
    p_action_items: lines(formData.get("actionItems")),
  });
  if (error) return { error: t.errors[errorKey(error.message)] ?? t.errors.generic };
  revalidatePath(`/meetings/${meetingId.data}`);
  return { message: t.settings.saved };
}

const assignForm = z.object({
  itemId: z.uuid(),
  assigneeIds: z.array(z.uuid()).min(1).max(20),
  priority: z.enum(["low", "medium", "high"]),
  size: z.enum(["xs", "s", "m", "l", "xl"]).nullable(),
  estimatedHours: z.number().min(0).max(2000).nullable(),
  dueLocal: localDateTime.nullable(),
  isPrivate: z.boolean(),
  isUrgent: z.boolean(),
});

export async function assignItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const opt = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const hours = opt("estimatedHours");
  const parsed = assignForm.safeParse({
    itemId: formData.get("itemId"),
    assigneeIds: formData.getAll("assigneeIds").map(String),
    priority: formData.get("priority") ?? "medium",
    size: opt("size"),
    estimatedHours: hours === null ? null : Number(hours),
    dueLocal: opt("dueLocal"),
    isPrivate: formData.get("isPrivate") === "on",
    isUrgent: formData.get("isUrgent") === "on",
  });
  if (!parsed.success) {
    const noAssignee = parsed.error.issues.some((i) => i.path[0] === "assigneeIds");
    return { error: noAssignee ? t.errors.assignee_required : t.errors.invalid_input };
  }
  const f = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_action_item", {
    p_item_id: f.itemId,
    p_assignee_ids: f.assigneeIds,
    p_priority: f.priority,
    p_size: f.size ?? undefined,
    p_estimated_hours: f.estimatedHours ?? undefined,
    p_due_at: f.dueLocal ? bangkokLocalToUtcIso(f.dueLocal) : undefined,
    p_is_private: f.isPrivate,
    p_is_urgent: f.isUrgent,
  });
  if (error) return { error: t.errors[errorKey(error.message)] ?? t.errors.generic };
  revalidatePath("/inbox");
  revalidatePath("/meetings", "layout");
  revalidatePath("/dashboard");
  return { message: "ok" };
}

export async function dismissItemAction(formData: FormData) {
  await requireViewer(["director", "manager", "admin"]);
  const itemId = z.uuid().parse(formData.get("itemId"));
  const supabase = await createClient();
  await supabase.rpc("dismiss_action_item", { p_item_id: itemId });
  revalidatePath("/inbox");
  revalidatePath("/meetings", "layout");
}

export type Suggestion = {
  userId: string;
  score: number;
  openTasks: number;
  freeHours: number;
  neededHours: number;
  onLeaveAtDue: boolean;
  skillLevel: number | null;
  components: { capacity: number; workload: number; skill: number; availability: number };
};

/** Rule-based ranking (see public.suggest_assignees). Leads only; never assigns. */
export async function getSuggestionsAction(input: {
  teamId: string;
  size: string | null;
  estimatedHours: string | null;
  dueLocal: string | null;
  skillId: string | null;
}): Promise<Suggestion[]> {
  await requireViewer(["director", "manager", "admin"]);
  const teamId = z.uuid().parse(input.teamId);
  const size = z.enum(["xs", "s", "m", "l", "xl"]).nullable().catch(null).parse(input.size || null);
  const hours = input.estimatedHours ? z.coerce.number().min(0).max(2000).catch(0).parse(input.estimatedHours) : null;
  const due = input.dueLocal && localDateTime.safeParse(input.dueLocal).success ? bangkokLocalToUtcIso(input.dueLocal) : null;
  const skill = input.skillId ? z.uuid().catch("").parse(input.skillId) || null : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("suggest_assignees", {
    p_team_id: teamId,
    p_size: size ?? undefined,
    p_estimated_hours: hours ?? undefined,
    p_due_at: due ?? undefined,
    p_skill_id: skill ?? undefined,
  });
  if (error) return [];
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    score: r.score,
    openTasks: r.open_tasks,
    freeHours: Number(r.free_hours),
    neededHours: Number(r.needed_hours),
    onLeaveAtDue: r.on_leave_at_due,
    skillLevel: r.skill_level,
    components: r.components as Suggestion["components"],
  }));
}
