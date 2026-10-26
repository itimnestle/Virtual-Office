import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-bits";
import { Alert, Card, Field, Input, Select } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { DEFAULT_AVATAR, type AvatarPart } from "@/lib/office/catalog";
import type { PetInfo } from "@/lib/office/state";
import { createClient } from "@/lib/supabase/server";
import { finishOnboardingAction, saveSkillsAction, saveStatusAction } from "./actions";
import { CharacterStudio } from "./character-studio";

export const metadata = { title: "My character" };

export default async function MePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const { welcome } = await searchParams;
  const supabase = await createClient();
  const [{ data: avatar }, { data: pet }, { data: skills }, { data: mySkills }, { data: status }] = await Promise.all([
    supabase.from("avatar_appearance").select("*").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("pets").select("species, breed, color, outfit, name, sound_enabled").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("skills").select("id, name_th, name_en").order("name_en"),
    supabase.from("member_skills").select("skill_id, level").eq("user_id", viewer.id),
    supabase.from("office_status").select("status, note, until").eq("user_id", viewer.id).maybeSingle(),
  ]);

  const initialAvatar = Object.fromEntries(
    (Object.keys(DEFAULT_AVATAR) as AvatarPart[]).map((k) => [k, (avatar?.[k] as string | undefined) ?? DEFAULT_AVATAR[k]]),
  ) as Record<AvatarPart, string>;
  const initialPet: PetInfo = pet
    ? { ...pet, species: pet.species as PetInfo["species"] }
    : { species: "cat", breed: "tabby", color: "orange", outfit: "none", name: "", sound_enabled: true };
  const level = new Map((mySkills ?? []).map((s) => [s.skill_id, s.level]));
  const activeStatus = status && (!status.until || new Date(status.until) > new Date()) ? status.status : "working";
  const firstTime = welcome === "1" || !viewer.onboarded;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t.studio.title}</h1>
      {firstTime ? <Alert tone="ok">{t.studio.welcome}</Alert> : null}

      <CharacterStudio
        initialAvatar={initialAvatar}
        initialPet={initialPet}
        displayName={viewer.nickname ?? viewer.fullName}
        labels={{
          avatar: t.studio.avatar,
          pet: t.studio.pet,
          preview: t.studio.preview,
          save: t.studio.save,
          parts: t.studio.parts,
          values: t.studio.values,
          species: t.studio.species,
          breed: t.studio.breed,
          color: t.studio.color,
          outfit: t.studio.outfit,
          petName: t.studio.petName,
          petSound: t.studio.petSound,
          petHint: t.studio.petHint,
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">{t.studio.skills}</h2>
          <ActionForm action={saveSkillsAction} submitLabel={t.studio.save} submitVariant="secondary">
            <div className="grid gap-3 sm:grid-cols-2">
              {(skills ?? []).map((s) => (
                <Field key={s.id} label={viewer.locale === "th" ? s.name_th : s.name_en} htmlFor={`sk-${s.id}`}>
                  <Select id={`sk-${s.id}`} name={`skill:${s.id}`} defaultValue={String(level.get(s.id) ?? "")}>
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {"★".repeat(n)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">{t.studio.status}</h2>
          <ActionForm action={saveStatusAction} submitLabel={t.studio.save} submitVariant="secondary">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.studio.status}>
              {(["working", "focus", "break", "offsite"] as const).map((k) => (
                <label key={k} className="flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                  <input type="radio" name="status" value={k} defaultChecked={activeStatus === k} /> {t.studio.statusKinds[k]}
                </label>
              ))}
            </div>
            <Field label={t.studio.statusNote} htmlFor="status-note" hint={t.studio.statusUntil}>
              <Input id="status-note" name="note" maxLength={80} defaultValue={activeStatus === "working" ? "" : (status?.note ?? "")} />
            </Field>
          </ActionForm>
        </Card>
      </div>

      {firstTime ? (
        <form action={finishOnboardingAction}>
          <SubmitButton>{t.studio.finish}</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
