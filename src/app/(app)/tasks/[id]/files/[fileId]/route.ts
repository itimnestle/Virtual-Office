import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Short-lived download link. The attachment row is read through RLS and the
 * signed URL is minted with the user's own session, so Storage policies
 * (can_view_task) apply twice. Links expire after 60 seconds.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  if (!(await getViewer())) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("task_attachments")
    .select("storage_path, file_name")
    .eq("id", fileId)
    .eq("task_id", id)
    .maybeSingle();
  if (!file) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await supabase.storage
    .from("task-files")
    .createSignedUrl(file.storage_path, 60, { download: file.file_name });
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
