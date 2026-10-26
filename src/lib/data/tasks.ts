import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Shared task query layer. Dashboard, task pages and (from Milestone B) the 3D
 * office all read through these functions so every surface shows the same
 * authorized data. All calls run as the signed-in user, so RLS applies.
 */
type Client = SupabaseClient<Database>;
type Enums = Database["public"]["Enums"];

export type TaskStatus = Enums["task_status"];
export const OPEN_STATUSES: TaskStatus[] = ["not_started", "in_progress", "blocked", "in_review", "revision_required", "paused"];

/** A row of public.task_directory(). Redacted rows only carry id/team/title. */
export type DirectoryRow = {
  id: string;
  team_id: string;
  title: string;
  is_private: boolean;
  redacted: boolean;
  status: TaskStatus | null;
  priority: Enums["task_priority"] | null;
  is_urgent: boolean | null;
  size: Enums["task_size"] | null;
  estimated_hours: number | null;
  due_at: string | null;
  created_by: string | null;
  created_at: string | null;
  archived_at: string | null;
  assignee_ids: string[] | null;
  is_new_today: boolean | null;
  has_pending_extension: boolean | null;
  assignee_absent_today: boolean | null;
  is_recurring: boolean | null;
  category_id: string | null;
  tag_ids: string[] | null;
};

export async function getTaskDirectory(supabase: Client, teamId?: string): Promise<DirectoryRow[]> {
  const { data, error } = await supabase.rpc("task_directory", teamId ? { p_team_id: teamId } : {});
  if (error) throw new Error(`task_directory failed: ${error.message}`);
  return (data ?? []) as DirectoryRow[];
}

export type TaskSearch = {
  query?: string;
  statuses?: TaskStatus[];
  categoryId?: string;
  tagId?: string;
  assigneeId?: string;
  priority?: Enums["task_priority"];
  urgentOnly?: boolean;
  includeArchived?: boolean;
};

/** Private-aware search (public.search_tasks): details match only on tasks the caller can open. */
export async function searchTasks(supabase: Client, s: TaskSearch): Promise<DirectoryRow[]> {
  const { data, error } = await supabase.rpc("search_tasks", {
    p_query: s.query || undefined,
    p_statuses: s.statuses?.length ? s.statuses : undefined,
    p_category_id: s.categoryId,
    p_tag_id: s.tagId,
    p_assignee_id: s.assigneeId,
    p_priority: s.priority,
    p_urgent_only: s.urgentOnly ?? false,
    p_include_archived: s.includeArchived ?? false,
  });
  if (error) throw new Error(`search_tasks failed: ${error.message}`);
  return (data ?? []) as DirectoryRow[];
}

export function isOpen(row: DirectoryRow): boolean {
  return !row.redacted && row.status !== null && OPEN_STATUSES.includes(row.status) && !row.archived_at;
}

export function isDueWithinDays(row: DirectoryRow, days: number, now = new Date()): boolean {
  if (!row.due_at) return false;
  const due = new Date(row.due_at).getTime();
  return due >= now.getTime() && due <= now.getTime() + days * 24 * 60 * 60 * 1000;
}

type Tables = Database["public"]["Tables"];

export type TaskDetail = {
  task: Tables["tasks"]["Row"];
  assignees: { user_id: string; is_primary: boolean }[];
  audit: { id: number; action: string; actor_id: string | null; created_at: string; details: unknown }[];
  submissions: Pick<Tables["task_submissions"]["Row"], "id" | "submitted_by" | "note" | "review_level" | "created_at">[];
  reviews: Pick<Tables["task_reviews"]["Row"], "id" | "submission_id" | "reviewer_id" | "decision" | "comment" | "created_at">[];
  attachments: Pick<
    Tables["task_attachments"]["Row"],
    "id" | "submission_id" | "file_name" | "file_key" | "version" | "size_bytes" | "uploaded_by" | "created_at"
  >[];
  checklist: Pick<Tables["task_checklist_items"]["Row"], "id" | "title" | "is_done" | "done_by" | "position">[];
  tagIds: string[];
  sourceMeeting: { id: string; title: string } | null;
  canReview: boolean;
  isReviewer: boolean;
  changeRequests: Pick<
    Tables["task_change_requests"]["Row"],
    "id" | "requested_by" | "current_due_at" | "proposed_due_at" | "reason" | "status" | "decided_by" | "decided_at" | "decision_note" | "created_at"
  >[];
  comments: Pick<Tables["task_comments"]["Row"], "id" | "author_id" | "body" | "mentions" | "created_at">[];
  recurrence: Pick<
    Tables["task_recurrence_rules"]["Row"],
    "freq" | "interval_n" | "weekdays" | "day_of_month" | "due_time" | "until_on" | "next_run_on" | "active"
  > | null;
};

/** Full detail when authorized; null when the caller cannot open the task. */
export async function getTaskDetail(supabase: Client, id: string): Promise<TaskDetail | null> {
  const { data: task } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (!task) return null;
  const [assignees, audit, submissions, reviews, attachments, source, canReview, isReviewer, requests, comments, recurrence, checklist, tags] =
    await Promise.all([
    supabase.from("task_assignees").select("user_id, is_primary").eq("task_id", id).order("assigned_at"),
    supabase.from("task_audit_logs").select("id, action, actor_id, created_at, details").eq("task_id", id).order("created_at"),
    supabase
      .from("task_submissions")
      .select("id, submitted_by, note, review_level, created_at")
      .eq("task_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("task_reviews").select("id, submission_id, reviewer_id, decision, comment, created_at").eq("task_id", id),
    supabase
      .from("task_attachments")
      .select("id, submission_id, file_name, file_key, version, size_bytes, uploaded_by, created_at")
      .eq("task_id", id)
      .order("file_key")
      .order("version", { ascending: false }),
    task.source_action_item_id
      ? supabase.from("meeting_action_items").select("meetings(id, title)").eq("id", task.source_action_item_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc("can_review_task", { p_task_id: id }),
    supabase.rpc("is_task_reviewer", { p_task_id: id }),
    supabase
      .from("task_change_requests")
      .select("id, requested_by, current_due_at, proposed_due_at, reason, status, decided_by, decided_at, decision_note, created_at")
      .eq("task_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("task_comments").select("id, author_id, body, mentions, created_at").eq("task_id", id).order("created_at"),
    supabase
      .from("task_recurrence_rules")
      .select("freq, interval_n, weekdays, day_of_month, due_time, until_on, next_run_on, active")
      .eq("template_task_id", id)
      .maybeSingle(),
    supabase.from("task_checklist_items").select("id, title, is_done, done_by, position").eq("task_id", id).order("position"),
    supabase.from("task_tag_links").select("tag_id").eq("task_id", id),
  ]);
  return {
    task,
    assignees: assignees.data ?? [],
    audit: audit.data ?? [],
    submissions: submissions.data ?? [],
    reviews: reviews.data ?? [],
    attachments: attachments.data ?? [],
    sourceMeeting: source.data?.meetings ?? null,
    canReview: canReview.data === true,
    isReviewer: isReviewer.data === true,
    changeRequests: requests.data ?? [],
    comments: comments.data ?? [],
    recurrence: recurrence.data ?? null,
    checklist: checklist.data ?? [],
    tagIds: (tags.data ?? []).map((t) => t.tag_id),
  };
}

export type Person = {
  id: string;
  full_name: string;
  nickname: string | null;
  role: Enums["app_role"];
  is_active: boolean;
};

export async function getPeople(supabase: Client): Promise<Map<string, Person>> {
  const { data } = await supabase.from("profiles").select("id, full_name, nickname, role, is_active").order("full_name");
  return new Map((data ?? []).map((p) => [p.id, p]));
}

export function displayName(p: Pick<Person, "full_name" | "nickname"> | undefined): string {
  if (!p) return "—";
  return p.nickname ? `${p.nickname} (${p.full_name})` : p.full_name;
}
