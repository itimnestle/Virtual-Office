"use server";

import { revalidatePath } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { requireViewer } from "@/lib/auth/session";
import { newInviteToken } from "@/lib/auth/invite";
import { publicEnv } from "@/lib/env";
import { errorKey, getDictionary } from "@/lib/i18n/dictionaries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { inviteForm, roleSchema } from "@/lib/validation";
import { z } from "zod";
import type { ActionState } from "@/components/form-bits";

/**
 * Every action first calls an admin-only RPC as the signed-in user, so the
 * database decides whether the caller is an Admin. The service-role client is
 * only used afterwards for auth-side effects the database cannot perform.
 */

export async function createInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer(["admin"]);
  const t = getDictionary(viewer.locale);
  const teamId = formData.get("teamId");
  const parsed = inviteForm.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    teamId: typeof teamId === "string" && teamId ? teamId : null,
  });
  if (!parsed.success) return { error: t.errors.invalid_input };

  const { token, hash } = newInviteToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_invite", {
    p_email: parsed.data.email,
    p_full_name: parsed.data.fullName,
    p_role: parsed.data.role,
    p_team_id: parsed.data.teamId as string,
    p_token_hash: hash,
  });
  if (error) return { error: t.errors[errorKey(error.message)] ?? t.errors.generic };

  revalidatePath("/admin/users");
  // The plaintext token exists only in this response; the database keeps its hash.
  return { message: `${publicEnv.siteUrl}/invite/${token}` };
}

export async function revokeInviteAction(formData: FormData) {
  await requireViewer(["admin"]);
  const supabase = await createClient();
  await supabase.rpc("admin_revoke_invite", { p_invite_id: String(formData.get("inviteId")) });
  revalidatePath("/admin/users");
}

export async function setUserActiveAction(formData: FormData) {
  await requireViewer(["admin"]);
  const userId = String(formData.get("userId"));
  const active = formData.get("active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_active", { p_user_id: userId, p_active: active });
  if (error) throw new Error(errorKey(error.message));
  // Also block sign-in at the auth layer (data stays; RLS already denies access).
  const { error: banError } = await createAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError) console.error("auth ban update failed", { userId, code: banError.code });
  revalidatePath("/admin/users");
}

export async function setUserRoleAction(formData: FormData) {
  await requireViewer(["admin"]);
  const role = roleSchema.parse(formData.get("role"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_role", { p_user_id: String(formData.get("userId")), p_role: role });
  if (error) throw new Error(errorKey(error.message));
  revalidatePath("/admin/users");
}

export async function sendResetEmailAction(formData: FormData) {
  await requireViewer(["admin"]);
  const supabase = await createClient();
  // RLS: the admin can read profiles of their own organization only.
  const { data: target } = await supabase.from("profiles").select("email, is_active").eq("id", String(formData.get("userId"))).maybeSingle();
  if (!target?.is_active) return;
  // A stateless client: the recovery email uses the token_hash template, so the
  // link works on the user's own device and the admin never sees the token.
  const anon = createPlainClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, { auth: { persistSession: false } });
  await anon.auth.resetPasswordForEmail(target.email, { redirectTo: `${publicEnv.siteUrl}/reset-password` });
}

const holidayForm = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(120),
});

/** RLS allows only Admins to write company holidays. */
export async function addHolidayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer(["admin"]);
  const t = getDictionary(viewer.locale);
  const parsed = holidayForm.safeParse({ date: formData.get("date"), name: formData.get("name") });
  if (!parsed.success) return { error: t.errors.invalid_input };
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_holidays")
    .insert({ org_id: viewer.orgId, holiday_on: parsed.data.date, name: parsed.data.name });
  if (error) return { error: t.errors.generic };
  revalidatePath("/admin/users");
  return { message: t.settings.saved };
}

export async function removeHolidayAction(formData: FormData) {
  await requireViewer(["admin"]);
  const supabase = await createClient();
  await supabase.from("company_holidays").delete().eq("id", z.uuid().parse(formData.get("id")));
  revalidatePath("/admin/users");
}
