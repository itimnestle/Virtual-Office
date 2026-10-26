import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n/dictionaries";
import type { Database } from "@/lib/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type Viewer = {
  id: string;
  orgId: string;
  email: string;
  fullName: string;
  nickname: string | null;
  role: AppRole;
  locale: Locale;
  theme: "system" | "light" | "dark";
  reduceMotion: boolean;
  soundEnabled: boolean;
  chatEffects: boolean;
  onboarded: boolean;
  teams: { teamId: string; isLead: boolean }[];
};

/**
 * The signed-in, ACTIVE user. Returns null when signed out or when the profile
 * is hidden by RLS (deactivated accounts resolve to no profile).
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;

  const [{ data: profile }, { data: teams }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, org_id, email, full_name, nickname, role, locale, theme, reduce_motion, sound_enabled, chat_effects, onboarding_completed_at, is_active")
      .eq("id", uid)
      .maybeSingle(),
    supabase.from("team_members").select("team_id, is_lead").eq("user_id", uid),
  ]);
  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    orgId: profile.org_id,
    email: profile.email,
    fullName: profile.full_name,
    nickname: profile.nickname,
    role: profile.role,
    locale: profile.locale as Locale,
    theme: profile.theme as Viewer["theme"],
    reduceMotion: profile.reduce_motion,
    soundEnabled: profile.sound_enabled,
    chatEffects: profile.chat_effects,
    onboarded: Boolean(profile.onboarding_completed_at),
    teams: (teams ?? []).map((t) => ({ teamId: t.team_id, isLead: t.is_lead })),
  };
});

export async function hasSession(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims?.sub);
}

/** Page guard. Deactivated-but-signed-in users are signed out. */
export async function requireViewer(roles?: AppRole[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    redirect((await hasSession()) ? "/auth/signout?reason=inactive" : "/login");
  }
  if (roles && !roles.includes(viewer.role)) {
    redirect("/dashboard?denied=1");
  }
  return viewer;
}

/** Locale for pages without a viewer (login, invite) comes from a cookie. */
export async function getRequestLocale(): Promise<Locale> {
  const viewer = await getViewer();
  if (viewer) return viewer.locale;
  const c = (await cookies()).get("locale")?.value;
  return c === "en" || c === "th" ? c : DEFAULT_LOCALE;
}

export async function getRequestDictionary() {
  return getDictionary(await getRequestLocale());
}
