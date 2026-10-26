import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_NEXT = new Set(["/reset-password", "/dashboard", "/office"]);

/**
 * Landing point for Supabase email links (password recovery). Supports both
 * the PKCE `code` flow and the `token_hash` template flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = ALLOWED_NEXT.has(searchParams.get("next") ?? "") ? searchParams.get("next")! : "/office";
  const supabase = await createClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type === "recovery") {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  return NextResponse.redirect(new URL(ok ? next : "/forgot-password?error=link", origin));
}
