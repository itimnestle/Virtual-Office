import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Scheduled chat purge (Vercel Cron or any scheduler with the bearer secret).
 *  1. run_chat_purge(): deletes expired messages, reactions and mention
 *     notifications, and queues their media as tombstones. (pg_cron also runs
 *     this every 10 minutes, so text never depends on this endpoint.)
 *  2. Deletes the queued media objects from Storage, then their tombstones.
 * Logs counts only — never chat content.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });
  const admin = createAdminClient();

  const { data: purged, error: purgeError } = await admin.rpc("run_chat_purge", {});
  if (purgeError) return NextResponse.json({ ok: false, step: "purge" }, { status: 500 });

  const { data: tombstones } = await admin.from("chat_media_tombstones").select("path").limit(1000);
  const paths = (tombstones ?? []).map((t) => t.path);
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await admin.storage.from("chat-media").remove(batch);
    if (error) break;
    await admin.from("chat_media_tombstones").delete().in("path", batch);
    removed += batch.length;
  }
  await admin.from("job_runs").insert({
    job: "chat_media_purge",
    finished_at: new Date().toISOString(),
    status: removed === paths.length ? "succeeded" : "failed",
    affected: removed,
  });
  return NextResponse.json({ ok: removed === paths.length, messages: purged ?? 0, media: removed, pending: paths.length - removed });
}
