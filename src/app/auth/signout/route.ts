import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const reason = request.nextUrl.searchParams.get("reason") === "inactive" ? "?reason=inactive" : "";
  return NextResponse.redirect(new URL(`/login${reason}`, request.nextUrl.origin), { status: 303 });
}

/** POST from the sign-out button; GET only for the forced sign-out of deactivated users. */
export const POST = signOut;
export const GET = signOut;
