"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { AVATAR_OPTIONS, PET_BREEDS, PET_COLORS, PET_OUTFITS } from "@/lib/office/catalog";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/form-bits";

/**
 * Character studio. Values are validated against the shared catalog here and
 * again by database CHECK constraints; RLS limits writes to the caller's rows.
 */

const avatarSchema = z.object(
  Object.fromEntries(Object.entries(AVATAR_OPTIONS).map(([k, v]) => [k, z.enum(v as unknown as [string, ...string[]])])) as Record<
    keyof typeof AVATAR_OPTIONS,
    z.ZodEnum<Record<string, string>>
  >,
);

export async function saveAvatarAction(values: Record<string, string>): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const parsed = avatarSchema.safeParse(values);
  if (!parsed.success) return { error: t.errors.invalid_input };
  const supabase = await createClient();
  const { error } = await supabase
    .from("avatar_appearance")
    .upsert({ user_id: viewer.id, org_id: viewer.orgId, ...parsed.data, updated_at: new Date().toISOString() });
  if (error) return { error: t.errors.generic };
  revalidatePath("/me");
  revalidatePath("/office");
  return { message: t.studio.saved };
}

const petSchema = z
  .object({
    species: z.enum(["dog", "cat"]),
    breed: z.string(),
    color: z.enum(PET_COLORS),
    outfit: z.enum(PET_OUTFITS),
    name: z.string().trim().min(1).max(40),
    sound_enabled: z.boolean(),
  })
  .refine((p) => (PET_BREEDS[p.species] as readonly string[]).includes(p.breed), { path: ["breed"] });

export async function savePetAction(values: z.input<typeof petSchema>): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const parsed = petSchema.safeParse(values);
  if (!parsed.success) return { error: t.errors.invalid_input };
  const supabase = await createClient();
  const { error } = await supabase
    .from("pets")
    .upsert({ user_id: viewer.id, org_id: viewer.orgId, ...parsed.data, updated_at: new Date().toISOString() });
  if (error) return { error: t.errors.generic };
  revalidatePath("/me");
  revalidatePath("/office");
  return { message: t.studio.saved };
}

export async function saveSkillsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const supabase = await createClient();
  const rows: { user_id: string; skill_id: string; org_id: string; level: number }[] = [];
  const removed: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("skill:")) continue;
    const skillId = z.uuid().safeParse(key.slice(6));
    if (!skillId.success) return { error: t.errors.invalid_input };
    const level = Number(value);
    if (!value) removed.push(skillId.data);
    else if (Number.isInteger(level) && level >= 1 && level <= 5) rows.push({ user_id: viewer.id, skill_id: skillId.data, org_id: viewer.orgId, level });
    else return { error: t.errors.invalid_input };
  }
  if (rows.length) {
    const { error } = await supabase.from("member_skills").upsert(rows);
    if (error) return { error: t.errors.generic };
  }
  if (removed.length) await supabase.from("member_skills").delete().eq("user_id", viewer.id).in("skill_id", removed);
  revalidatePath("/me");
  return { message: t.studio.saved };
}

/** End of today's work day (17:00 Asia/Bangkok) as UTC ISO. */
function endOfWorkDayIso(now = new Date()): string {
  const bkk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
  const end = new Date(`${bkk}T17:00:00+07:00`);
  return (end > now ? end : new Date(end.getTime() + 24 * 3_600_000)).toISOString();
}

export async function saveStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const parsed = z
    .object({ status: z.enum(["working", "focus", "break", "offsite"]), note: z.string().trim().max(80) })
    .safeParse({ status: formData.get("status"), note: String(formData.get("note") ?? "") });
  if (!parsed.success) return { error: t.errors.invalid_input };
  const supabase = await createClient();
  const { error } = await supabase.from("office_status").upsert({
    user_id: viewer.id,
    org_id: viewer.orgId,
    status: parsed.data.status,
    note: parsed.data.note || null,
    until: parsed.data.status === "working" ? null : endOfWorkDayIso(),
  });
  if (error) return { error: t.errors.generic };
  revalidatePath("/office");
  revalidatePath("/me");
  return { message: t.studio.saved };
}

export async function finishOnboardingAction() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  await supabase.from("profiles").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", viewer.id);
  revalidatePath("/", "layout");
  redirect("/office");
}
