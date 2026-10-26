"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "@/lib/auth/invite";
import { getRequestDictionary } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { emailSchema, newPasswordForm } from "@/lib/validation";
import type { ActionState } from "@/components/form-bits";

function safeNext(next: FormDataEntryValue | null): string {
  const v = typeof next === "string" ? next : "";
  // Only same-site relative paths; blocks open redirects like //evil.com.
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/office";
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getRequestDictionary();
  const email = emailSchema.safeParse(formData.get("email"));
  const password = formData.get("password");
  if (!email.success || typeof password !== "string" || password.length === 0) {
    return { error: t.auth.invalidLogin };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password });
  if (error) return { error: t.auth.invalidLogin };
  redirect(safeNext(formData.get("next")));
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getRequestDictionary();
  const email = emailSchema.safeParse(formData.get("email"));
  if (email.success) {
    const supabase = await createClient();
    // Same response whether or not the account exists (no account enumeration).
    await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/reset-password`,
    });
  }
  return { message: t.auth.resetSent };
}

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getRequestDictionary();
  const parsed = newPasswordForm.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((i) => i.path[0] === "confirm");
    return { error: mismatch ? t.auth.passwordMismatch : t.auth.passwordRule };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: t.auth.linkInvalid };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.code === "same_password" ? t.auth.passwordRule : t.errors.generic };
  redirect("/office");
}

export async function acceptInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getRequestDictionary();
  const token = String(formData.get("token") ?? "");
  const parsed = newPasswordForm.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((i) => i.path[0] === "confirm");
    return { error: mismatch ? t.auth.passwordMismatch : t.auth.passwordRule };
  }
  const nickname = String(formData.get("nickname") ?? "").trim().slice(0, 40);

  const result = await acceptInvite(token, parsed.data.password);
  if (!result.ok) return { error: t.errors[result.error] ?? t.errors.generic };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: result.email, password: parsed.data.password });
  if (error || !data.user) redirect("/login");
  if (nickname) {
    await supabase.from("profiles").update({ nickname }).eq("id", data.user.id);
  }
  redirect("/me?welcome=1");
}

export async function setLocaleCookie(formData: FormData) {
  const locale = formData.get("locale") === "en" ? "en" : "th";
  (await cookies()).set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
