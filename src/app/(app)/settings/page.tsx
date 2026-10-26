import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Alert, Card, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { requireViewer } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { settingsForm } from "@/lib/validation";

export const metadata = { title: "Settings" };

async function saveSettings(formData: FormData) {
  "use server";
  const viewer = await requireViewer();
  const parsed = settingsForm.safeParse({
    fullName: formData.get("fullName"),
    nickname: formData.get("nickname") ?? "",
    locale: formData.get("locale"),
    theme: formData.get("theme"),
    reduceMotion: formData.get("reduceMotion") === "on",
  });
  if (!parsed.success) redirect("/settings?error=1");
  const f = parsed.data;
  const supabase = await createClient();
  // Column grants limit this to self-service fields; RLS limits it to the own row.
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: f.fullName,
      nickname: f.nickname || null,
      locale: f.locale,
      theme: f.theme,
      reduce_motion: f.reduceMotion,
    })
    .eq("id", viewer.id);
  if (error) redirect("/settings?error=1");
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const params = await searchParams;
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t.settings.title}</h1>
      {params.saved ? <Alert tone="ok">{t.settings.saved}</Alert> : null}
      {params.error ? <Alert>{t.errors.invalid_input}</Alert> : null}
      <Card>
        <form action={saveSettings} className="flex flex-col gap-4">
          <Field label={t.settings.fullName} htmlFor="fullName">
            <Input id="fullName" name="fullName" defaultValue={viewer.fullName} required maxLength={120} />
          </Field>
          <Field label={t.settings.nickname} htmlFor="nickname">
            <Input id="nickname" name="nickname" defaultValue={viewer.nickname ?? ""} maxLength={40} />
          </Field>
          <Field label={t.settings.language} htmlFor="locale">
            <Select id="locale" name="locale" defaultValue={viewer.locale}>
              <option value="th">ไทย</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <Field label={t.settings.theme} htmlFor="theme">
            <Select id="theme" name="theme" defaultValue={viewer.theme}>
              {(["system", "light", "dark"] as const).map((k) => (
                <option key={k} value={k}>
                  {t.settings.themes[k]}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="reduceMotion" defaultChecked={viewer.reduceMotion} /> {t.settings.reduceMotion}
          </label>
          <SubmitButton>{t.settings.save}</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
