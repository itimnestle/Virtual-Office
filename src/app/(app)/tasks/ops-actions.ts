"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { errorKey, getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { bangkokLocalToUtcIso } from "@/lib/time";
import type { ActionState } from "@/components/form-bits";

/**
 * Milestone C task operations. Each action validates shape only and lets the
 * database RPC decide who may do what.
 */

const uuid = z.uuid();
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const str = (v: FormDataEntryValue | null, max = 5000) => String(v ?? "").trim().slice(0, max);

async function run(
  formData: FormData,
  call: (supabase: Awaited<ReturnType<typeof createClient>>, taskId: string) => PromiseLike<{ error: { message: string } | null }>,
  successMessage: (t: ReturnType<typeof getDictionary>) => string,
): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const taskId = uuid.safeParse(formData.get("taskId"));
  if (!taskId.success) return { error: t.errors.invalid_input };
  try {
    const supabase = await createClient();
    const { error } = await call(supabase, taskId.data);
    if (error) return { error: t.errors[errorKey(error.message)] ?? t.errors.generic };
  } catch {
    return { error: t.errors.invalid_input };
  }
  revalidatePath(`/tasks/${taskId.data}`);
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  return { message: successMessage(t) };
}

export async function requestExtensionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(
    formData,
    (s, taskId) =>
      s.rpc("request_due_change", {
        p_task_id: taskId,
        p_proposed_due_at: bangkokLocalToUtcIso(localDateTime.parse(formData.get("newDue"))),
        p_reason: str(formData.get("reason"), 2000),
      }),
    (t) => t.ops.pendingNote,
  );
}

export async function decideExtensionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(
    formData,
    (s) =>
      s.rpc("decide_due_change", {
        p_request_id: uuid.parse(formData.get("requestId")),
        p_approve: formData.get("decision") === "approve",
        p_note: str(formData.get("note"), 2000),
      }),
    (t) => t.settings.saved,
  );
}

export async function updateDetailsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const due = str(formData.get("due"));
  const hours = str(formData.get("estimatedHours"));
  const reminder = str(formData.get("reminderDays"));
  return run(
    formData,
    (s, taskId) =>
      s.rpc("update_task_details", {
        p_task_id: taskId,
        p_due_at: due ? bangkokLocalToUtcIso(localDateTime.parse(due)) : undefined,
        p_priority: z.enum(["low", "medium", "high"]).parse(formData.get("priority")),
        p_size: z.enum(["xs", "s", "m", "l", "xl"]).optional().parse(str(formData.get("size")) || undefined),
        p_estimated_hours: hours ? z.coerce.number().min(0).max(2000).parse(hours) : undefined,
        p_reminder_days: reminder ? z.coerce.number().int().min(0).max(30).parse(reminder) : undefined,
      }),
    (t) => t.settings.saved,
  );
}

export async function addCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(
    formData,
    (s, taskId) =>
      s.rpc("add_task_comment", {
        p_task_id: taskId,
        p_body: str(formData.get("body")),
        p_mentions: z.array(uuid).max(30).parse(formData.getAll("mentions").map(String)),
      }),
    () => "✓",
  );
}

export async function setRecurrenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const until = str(formData.get("until"));
  const dom = str(formData.get("dayOfMonth"));
  return run(
    formData,
    (s, taskId) =>
      s.rpc("set_task_recurrence", {
        p_task_id: taskId,
        p_freq: z.enum(["daily", "weekly", "monthly", "yearly", "custom"]).parse(formData.get("freq")),
        p_interval: z.coerce.number().int().min(1).max(365).parse(formData.get("interval") || 1),
        p_weekdays: formData.getAll("weekdays").map((w) => z.coerce.number().int().min(1).max(7).parse(w)),
        p_day_of_month: dom ? z.coerce.number().int().min(1).max(31).parse(dom) : undefined,
        p_due_time: z.string().regex(/^\d{2}:\d{2}$/).parse(formData.get("dueTime") || "17:00"),
        p_until: until ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(until) : undefined,
      }),
    (t) => t.settings.saved,
  );
}

export async function stopRecurrenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(formData, (s, taskId) => s.rpc("stop_task_recurrence", { p_task_id: taskId }), (t) => t.settings.saved);
}

const uploadedList = z
  .array(z.object({ path: z.string().min(1).max(500), name: z.string().min(1).max(255), size: z.number().int().min(0), mime: z.string().max(255) }))
  .min(1)
  .max(10);

export async function addFilesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(
    formData,
    (s, taskId) =>
      s.rpc("add_task_files", {
        p_task_id: taskId,
        p_attachments: uploadedList.parse(JSON.parse(String(formData.get("attachments") ?? "[]"))),
      }),
    (t) => t.settings.saved,
  );
}

export async function addChecklistItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(formData, (s, taskId) => s.rpc("add_checklist_item", { p_task_id: taskId, p_title: str(formData.get("title"), 300) }), () => "");
}

export async function setChecklistDoneAction(formData: FormData) {
  await run(
    formData,
    (s) => s.rpc("set_checklist_item_done", { p_item_id: uuid.parse(formData.get("itemId")), p_done: formData.get("done") === "true" }),
    () => "",
  );
}

export async function removeChecklistItemAction(formData: FormData) {
  await run(formData, (s) => s.rpc("remove_checklist_item", { p_item_id: uuid.parse(formData.get("itemId")) }), () => "");
}

export async function setTagsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(
    formData,
    (s, taskId) => s.rpc("set_task_tags", { p_task_id: taskId, p_tag_ids: z.array(uuid).max(20).parse(formData.getAll("tagIds").map(String)) }),
    (t) => t.settings.saved,
  );
}

export async function setCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const category = str(formData.get("categoryId"));
  return run(
    formData,
    (s, taskId) => s.rpc("set_task_category", { p_task_id: taskId, p_category_id: category ? uuid.parse(category) : (null as unknown as string) }),
    (t) => t.settings.saved,
  );
}
