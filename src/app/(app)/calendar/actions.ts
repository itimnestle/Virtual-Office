"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/form-bits";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const leaveForm = z
  .object({
    startsOn: date,
    endsOn: date,
    part: z.enum(["full_day", "am", "pm"]),
    reason: z.string().trim().max(1000),
  })
  .refine((v) => v.endsOn >= v.startsOn, { path: ["endsOn"] })
  .refine((v) => v.part === "full_day" || v.startsOn === v.endsOn, { path: ["part"], message: "half_day" });

/** Leave needs no approval; RLS only lets people write their own rows. */
export async function addLeaveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const parsed = leaveForm.safeParse({
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn") || formData.get("startsOn"),
    part: formData.get("part"),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) {
    const half = parsed.error.issues.some((i) => i.message === "half_day");
    return { error: half ? t.calendar.halfDayOneDate : t.errors.invalid_input };
  }
  const f = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("member_absences").insert({
    org_id: viewer.orgId,
    user_id: viewer.id,
    starts_on: f.startsOn,
    ends_on: f.endsOn,
    part: f.part,
    reason: f.reason || null,
  });
  if (error) return { error: t.errors.generic };
  revalidatePath("/calendar");
  return { message: t.settings.saved };
}

export async function removeLeaveAction(formData: FormData) {
  const viewer = await requireViewer();
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("member_absences").delete().eq("id", id).eq("user_id", viewer.id);
  revalidatePath("/calendar");
}
