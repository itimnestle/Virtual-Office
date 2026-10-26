import { Badge, Card, Select } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { requireViewer } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { formatBangkok } from "@/lib/time";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import {
  addHolidayAction,
  removeHolidayAction,
  revokeInviteAction,
  sendResetEmailAction,
  setUserActiveAction,
  setUserRoleAction,
} from "./actions";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Accounts" };

export default async function AdminUsersPage() {
  const viewer = await requireViewer(["admin"]);
  const t = getDictionary(viewer.locale);
  const supabase = await createClient();

  const [{ data: users }, { data: invites }, { data: teams }, { data: holidays }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, nickname, role, is_active, deactivated_at").order("role").order("full_name"),
    supabase
      .from("invites")
      .select("id, email, full_name, role, expires_at")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("company_holidays").select("id, holiday_on, name").order("holiday_on"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.admin.title}</h1>
        <p className="text-sm text-muted">{t.admin.noPasswordNote}</p>
        <p className="text-sm text-muted">{t.admin.retentionNote}</p>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">{t.admin.invite}</h2>
        <InviteForm
          teams={teams ?? []}
          labels={{
            email: t.auth.email,
            fullName: t.admin.fullName,
            role: t.invite.role,
            team: t.admin.team,
            noTeam: t.admin.noTeam,
            submit: t.admin.sendInvite,
            pending: t.common.loading,
            link: t.admin.inviteLink,
            copy: t.admin.copy,
            roles: t.roles,
          }}
        />
      </Card>

      {invites?.length ? (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">{t.admin.pending}</h2>
          <ul className="divide-y divide-border text-sm">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {inv.full_name} · <span className="break-all text-muted">{inv.email}</span> · {t.roles[inv.role]}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {t.admin.expires} {formatBangkok(inv.expires_at, viewer.locale)}
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="inviteId" value={inv.id} />
                    <SubmitButton variant="ghost" className="min-h-8 px-2 text-danger">
                      {t.admin.revoke}
                    </SubmitButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-0">
        <h2 className="px-5 pt-5 pb-3 text-lg font-semibold">{t.admin.users}</h2>
        <ul className="divide-y divide-border">
          {(users ?? []).map((u) => (
            <li key={u.id} className="flex flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="font-medium">
                  {u.nickname ? `${u.nickname} · ` : ""}
                  {u.full_name}
                </p>
                <p className="text-xs break-all text-muted">{u.email}</p>
                <div className="mt-1 flex gap-2">
                  <Badge tone="primary">{t.roles[u.role]}</Badge>
                  <Badge tone={u.is_active ? "ok" : "danger"}>{u.is_active ? t.admin.active : t.admin.inactive}</Badge>
                </div>
              </div>
              {u.id === viewer.id ? null : (
                <div className="flex flex-wrap items-center gap-2">
                  <form action={setUserRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <Select name="role" defaultValue={u.role} aria-label={t.admin.changeRole} className="min-h-9 w-auto py-1">
                      {Object.entries(t.roles).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton variant="secondary" className="min-h-9">
                      {t.admin.changeRole}
                    </SubmitButton>
                  </form>
                  <form action={setUserActiveAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="active" value={u.is_active ? "false" : "true"} />
                    <SubmitButton variant={u.is_active ? "danger" : "secondary"} className="min-h-9">
                      {u.is_active ? t.admin.deactivate : t.admin.reactivate}
                    </SubmitButton>
                  </form>
                  {u.is_active ? (
                    <form action={sendResetEmailAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <SubmitButton variant="ghost" className="min-h-9">
                        {t.admin.sendReset}
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">{t.holidays.title}</h2>
        <ul className="mb-4 flex flex-col gap-1 text-sm">
          {(holidays ?? []).map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2">
              <span>
                {h.holiday_on} · {h.name}
              </span>
              <form action={removeHolidayAction}>
                <input type="hidden" name="id" value={h.id} />
                <SubmitButton variant="ghost" className="min-h-8 px-2 text-xs text-danger">
                  {t.holidays.remove}
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        <ActionForm action={addHolidayAction} submitLabel={t.holidays.add} submitVariant="secondary">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.holidays.date} htmlFor="h-date">
              <Input id="h-date" name="date" type="date" required />
            </Field>
            <Field label={t.holidays.name} htmlFor="h-name">
              <Input id="h-name" name="name" required maxLength={120} />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
