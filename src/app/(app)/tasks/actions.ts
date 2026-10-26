"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/session";
import { errorKey, getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { bangkokLocalToUtcIso } from "@/lib/time";
import { createTaskForm } from "@/lib/validation";
import { z } from "zod";
import type { ActionState } from "@/components/form-bits";

function optional(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Validates input, then defers every authorization rule to public.create_task(). */
export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);

  const hours = optional(formData.get("estimatedHours"));
  const parsed = createTaskForm.safeParse({
    teamId: formData.get("teamId"),
    title: formData.get("title"),
    description: optional(formData.get("description")) ?? undefined,
    assigneeIds: formData.getAll("assigneeIds").map(String),
    priority: formData.get("priority") ?? "medium",
    size: optional(formData.get("size")),
    estimatedHours: hours === null ? null : Number(hours),
    dueLocal: optional(formData.get("dueLocal")),
    isPrivate: formData.get("isPrivate") === "on",
    isUrgent: formData.get("isUrgent") === "on",
    categoryId: optional(formData.get("categoryId")),
  });
  if (!parsed.success) return { error: t.errors.invalid_input };
  const f = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_task", {
    p_team_id: f.teamId,
    p_title: f.title,
    p_description: f.description,
    p_assignee_ids: f.assigneeIds.length ? f.assigneeIds : undefined,
    p_priority: f.priority,
    p_is_private: f.isPrivate,
    p_is_urgent: f.isUrgent,
    p_due_at: f.dueLocal ? bangkokLocalToUtcIso(f.dueLocal) : undefined,
    p_size: f.size ?? undefined,
    p_estimated_hours: f.estimatedHours ?? undefined,
    p_category_id: f.categoryId ?? undefined,
  });
  if (error) return { error: t.errors[errorKey(error.message)] ?? t.errors.generic };

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect(`/tasks/${data}`);
}

const uuid = z.uuid();

export async function changeStatusAction(formData: FormData) {
  await requireViewer();
  const taskId = uuid.parse(formData.get("taskId"));
  const status = z
    .enum(["not_started", "in_progress", "blocked", "paused", "revision_required", "cancelled"])
    .parse(formData.get("status"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_task_status", { p_task_id: taskId, p_status: status });
  if (error) redirect(`/tasks/${taskId}?error=${errorKey(error.message)}`);
  revalidatePath(`/tasks/${taskId}`);
}

const attachmentList = z
  .array(
    z.object({
      path: z.string().min(1).max(500),
      name: z.string().min(1).max(255),
      size: z.number().int().min(0),
      mime: z.string().max(255),
    }),
  )
  .max(10);

export async function submitTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const taskId = uuid.safeParse(formData.get("taskId"));
  let files: unknown = [];
  try {
    files = JSON.parse(String(formData.get("attachments") ?? "[]"));
  } catch {
    return { error: t.errors.invalid_input };
  }
  const attachments = attachmentList.safeParse(files);
  if (!taskId.success || !attachments.success) return { error: t.errors.invalid_input };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_task", {
    p_task_id: taskId.data,
    p_note: String(formData.get("note") ?? "").slice(0, 5000),
    p_attachments: attachments.data,
  });
  if (error) return { error: t.errors[errorKey(error.message)] ?? t.errors.generic };
  revalidatePath(`/tasks/${taskId.data}`);
  revalidatePath("/dashboard");
  return { message: "ok" };
}

export async function reviewTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const taskId = uuid.safeParse(formData.get("taskId"));
  const decision = z.enum(["approved", "revision_required"]).safeParse(formData.get("decision"));
  if (!taskId.success || !decision.success) return { error: t.errors.invalid_input };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_task", {
    p_task_id: taskId.data,
    p_decision: decision.data,
    p_comment: String(formData.get("comment") ?? "").slice(0, 5000),
  });
  if (error) return { error: t.errors[errorKey(error.message)] ?? t.errors.generic };
  revalidatePath(`/tasks/${taskId.data}`);
  revalidatePath("/dashboard");
  return { message: "ok" };
}
