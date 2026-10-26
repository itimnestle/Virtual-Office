"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/form-bits";

/**
 * Organization configuration. RLS allows these writes for Admins only; the
 * role guard here just gives non-admins a clean redirect.
 */

const uuid = z.uuid();
const name = z.string().trim().min(1).max(120);

async function done(t: ReturnType<typeof getDictionary>, error: { message: string } | null): Promise<ActionState> {
  if (error) return { error: t.errors.generic };
  revalidatePath("/admin/config");
  return { message: t.settings.saved };
}

export async function createTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer(["admin"]);
  const t = getDictionary(viewer.locale);
  const parsed = name.safeParse(formData.get("name"));
  if (!parsed.success) return { error: t.errors.invalid_input };
  const supabase = await createClient();
  const { error } = await supabase.from("teams").insert({ org_id: viewer.orgId, name: parsed.data });
  return done(t, error);
}

export async function renameTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer(["admin"]);
  const t = getDictionary(viewer.locale);
  const parsed = z.object({ id: uuid, name }).safeParse({ id: formData.get("id"), name: formData.get("name") });
  if (!parsed.success) return { error: t.errors.invalid_input };
  const supabase = await createClient();
  const { error } = await supabase.from("teams").update({ name: parsed.data.name }).eq("id", parsed.data.id);
  return done(t, error);
}

/** Add/remove a member or change the lead flag (audited by admin_set_team_membership). */
export async function setMembershipAction(formData: FormData) {
  await requireViewer(["admin"]);
  const supabase = await createClient();
  await supabase.rpc("admin_set_team_membership", {
    p_team_id: uuid.parse(formData.get("teamId")),
    p_user_id: uuid.parse(formData.get("userId")),
    p_is_member: formData.get("member") !== "false",
    p_is_lead: formData.get("lead") === "true",
  });
  revalidatePath("/admin/config");
}

export async function addCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer(["admin"]);
  const t = getDictionary(viewer.locale);
  const parsed = z
    .object({ th: name, en: name })
    .safeParse({ th: formData.get("nameTh"), en: formData.get("nameEn") });
  if (!parsed.success) return { error: t.errors.invalid_input };
  const supabase = await createClient();
  const { count } = await supabase.from("task_categories").select("id", { count: "exact", head: true });
  const { error } = await supabase
    .from("task_categories")
    .insert({ org_id: viewer.orgId, name_th: parsed.data.th, name_en: parsed.data.en, sort_order: (count ?? 0) + 1 });
  return done(t, error);
}

export async function toggleCategoryAction(formData: FormData) {
  await requireViewer(["admin"]);
  const supabase = await createClient();
  await supabase
    .from("task_categories")
    .update({ is_active: formData.get("active") === "true" })
    .eq("id", uuid.parse(formData.get("id")));
  revalidatePath("/admin/config");
}

export async function addTagAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer(["admin"]);
  const t = getDictionary(viewer.locale);
  const parsed = z
    .object({ name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })
    .safeParse({ name: formData.get("name"), color: formData.get("color") });
  if (!parsed.success) return { error: t.errors.invalid_input };
  const supabase = await createClient();
  const { error } = await supabase.from("task_tags").insert({ org_id: viewer.orgId, ...parsed.data });
  return done(t, error);
}

export async function toggleTagAction(formData: FormData) {
  await requireViewer(["admin"]);
  const supabase = await createClient();
  await supabase
    .from("task_tags")
    .update({ is_active: formData.get("active") === "true" })
    .eq("id", uuid.parse(formData.get("id")));
  revalidatePath("/admin/config");
}
