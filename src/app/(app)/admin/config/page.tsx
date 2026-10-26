import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-bits";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { displayName, getPeople } from "@/lib/data/tasks";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import {
  addCategoryAction,
  addTagAction,
  createTeamAction,
  renameTeamAction,
  setMembershipAction,
  toggleCategoryAction,
  toggleTagAction,
} from "./actions";

export const metadata = { title: "Organization" };

function Toggle({ action, id, active, labels }: { action: (f: FormData) => Promise<void>; id: string; active: boolean; labels: { on: string; off: string } }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <SubmitButton variant="ghost" className="min-h-8 px-2 text-xs">
        <Badge tone={active ? "ok" : "neutral"}>{active ? labels.on : labels.off}</Badge>
      </SubmitButton>
    </form>
  );
}

export default async function OrgConfigPage() {
  const viewer = await requireViewer(["admin"]);
  const t = getDictionary(viewer.locale);
  const supabase = await createClient();
  const [people, { data: teams }, { data: members }, { data: categories }, { data: tags }] = await Promise.all([
    getPeople(supabase),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("team_members").select("team_id, user_id, is_lead"),
    supabase.from("task_categories").select("id, name_th, name_en, is_active, sort_order").order("sort_order"),
    supabase.from("task_tags").select("id, name, color, is_active").order("name"),
  ]);
  const staff = [...people.values()].filter((p) => p.is_active && p.role !== "admin");
  const toggleLabels = { on: t.orgConfig.active, off: t.orgConfig.inactive };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.orgConfig.title}</h1>
        <p className="text-sm text-muted">{t.orgConfig.policiesNote}</p>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t.orgConfig.teams}</h2>
        {(teams ?? []).map((team) => {
          const inTeam = (members ?? []).filter((m) => m.team_id === team.id);
          const outside = staff.filter((p) => !inTeam.some((m) => m.user_id === p.id));
          return (
            <section key={team.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
              <ActionForm action={renameTeamAction} submitLabel={t.orgConfig.rename} submitVariant="secondary" className="sm:flex-row sm:items-end">
                <input type="hidden" name="id" value={team.id} />
                <Input name="name" defaultValue={team.name} required maxLength={120} aria-label={t.orgConfig.rename} className="sm:max-w-xs" />
              </ActionForm>
              <ul className="flex flex-col gap-1 text-sm">
                {inTeam.map((m) => (
                  <li key={m.user_id} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-48">{displayName(people.get(m.user_id))}</span>
                    {m.is_lead ? <Badge tone="primary">{t.orgConfig.lead}</Badge> : null}
                    <form action={setMembershipAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="userId" value={m.user_id} />
                      <input type="hidden" name="lead" value={m.is_lead ? "false" : "true"} />
                      <SubmitButton variant="ghost" className="min-h-8 px-2 text-xs">
                        {m.is_lead ? t.orgConfig.unsetLead : t.orgConfig.makeLead}
                      </SubmitButton>
                    </form>
                    <form action={setMembershipAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="userId" value={m.user_id} />
                      <input type="hidden" name="member" value="false" />
                      <SubmitButton variant="ghost" className="min-h-8 px-2 text-xs text-danger">
                        {t.orgConfig.removeMember}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
              {outside.length ? (
                <form action={setMembershipAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="teamId" value={team.id} />
                  <Select name="userId" aria-label={t.orgConfig.addMember} className="w-auto min-w-56">
                    {outside.map((p) => (
                      <option key={p.id} value={p.id}>
                        {displayName(p)}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton variant="secondary">{t.orgConfig.addMember}</SubmitButton>
                </form>
              ) : null}
            </section>
          );
        })}
        <ActionForm action={createTeamAction} submitLabel={t.orgConfig.addTeam} className="sm:flex-row sm:items-end">
          <Field label={t.orgConfig.newTeam} htmlFor="new-team">
            <Input id="new-team" name="name" required maxLength={120} />
          </Field>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.orgConfig.categories}</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {(categories ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="min-w-48">
                {c.name_th} / {c.name_en}
              </span>
              <Toggle action={toggleCategoryAction} id={c.id} active={c.is_active} labels={toggleLabels} />
            </li>
          ))}
        </ul>
        <ActionForm action={addCategoryAction} submitLabel={t.orgConfig.addCategory} submitVariant="secondary">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.orgConfig.nameTh} htmlFor="cat-th">
              <Input id="cat-th" name="nameTh" required maxLength={80} />
            </Field>
            <Field label={t.orgConfig.nameEn} htmlFor="cat-en">
              <Input id="cat-en" name="nameEn" required maxLength={80} />
            </Field>
          </div>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.orgConfig.tags}</h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {(tags ?? []).map((tg) => (
            <li key={tg.id} className="flex items-center gap-1 rounded-xl border border-border px-2 py-1">
              <span className="size-3 rounded-full" style={{ background: tg.color }} aria-hidden />#{tg.name}
              <Toggle action={toggleTagAction} id={tg.id} active={tg.is_active} labels={toggleLabels} />
            </li>
          ))}
        </ul>
        <ActionForm action={addTagAction} submitLabel={t.orgConfig.addTag} submitVariant="secondary">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label={t.orgConfig.tagName} htmlFor="tag-name">
              <Input id="tag-name" name="name" required maxLength={40} />
            </Field>
            <Field label={t.orgConfig.color} htmlFor="tag-color">
              <Input id="tag-color" name="color" type="color" defaultValue="#5cc2ab" className="h-10 w-16 p-1" />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
