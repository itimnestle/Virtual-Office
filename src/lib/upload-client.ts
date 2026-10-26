"use client";

import { createClient } from "@/lib/supabase/client";
import { MAX_FILE_BYTES, MAX_FILES, storageSafeName } from "@/lib/workflow";

export type Uploaded = { path: string; name: string; size: number; mime: string };

/**
 * Uploads files straight from the browser into the private task folder
 * (Storage RLS checks the task). The caller then records them with an RPC
 * (submit_task / add_task_files), which verifies each object exists.
 */
export async function uploadTaskFiles(
  orgId: string,
  taskId: string,
  files: File[],
): Promise<{ ok: true; uploaded: Uploaded[] } | { ok: false; error: "too_large" | "upload_failed" }> {
  const list = files.slice(0, MAX_FILES);
  if (list.some((f) => f.size > MAX_FILE_BYTES)) return { ok: false, error: "too_large" };
  const supabase = createClient();
  const uploaded: Uploaded[] = [];
  for (const file of list) {
    const path = `${orgId}/${taskId}/${crypto.randomUUID()}-${storageSafeName(file.name)}`;
    const { error } = await supabase.storage.from("task-files").upload(path, file, { contentType: file.type || undefined });
    if (error) return { ok: false, error: "upload_failed" };
    uploaded.push({ path, name: file.name, size: file.size, mime: file.type });
  }
  return { ok: true, uploaded };
}
