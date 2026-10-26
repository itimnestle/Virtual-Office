import type { Database } from "@/lib/database.types";

type TaskStatus = Database["public"]["Enums"]["task_status"];

/**
 * UI mirror of public.update_task_status(). The database is authoritative;
 * this only decides which buttons to show.
 */
const WORK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  not_started: ["in_progress", "blocked", "paused"],
  in_progress: ["blocked", "paused"],
  blocked: ["in_progress", "paused"],
  paused: ["in_progress", "blocked"],
  revision_required: ["in_progress", "blocked", "paused"],
  in_review: [],
  completed: [],
  cancelled: [],
};

export function allowedTransitions(status: TaskStatus, opts: { isLead: boolean }): TaskStatus[] {
  const next = [...WORK_TRANSITIONS[status]];
  if (opts.isLead && !["in_review", "completed", "cancelled"].includes(status)) next.push("cancelled");
  return next;
}

export const SUBMITTABLE: TaskStatus[] = ["not_started", "in_progress", "revision_required", "blocked", "paused"];

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES = 10;

/** Storage keys must be ASCII-safe; the original name is kept in task_attachments.file_name. */
export function storageSafeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^A-Za-z0-9]/g, "").slice(0, 10) : "";
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "file";
  return ext ? `${base}.${ext}` : base;
}
