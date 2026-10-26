import Link from "next/link";
import { Alert, Card, Field, Input } from "@/components/ui";
import { PasswordForm } from "@/components/password-form";
import { findPendingInvite } from "@/lib/auth/invite";
import { getRequestDictionary } from "@/lib/auth/session";
import { acceptInviteAction } from "../../actions";

export const metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, t] = await Promise.all([params, getRequestDictionary()]);
  const invite = await findPendingInvite(token);

  if (!invite) {
    return (
      <Card className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{t.invite.title}</h1>
        <Alert>{t.invite.invalid}</Alert>
        <Link href="/login" className="text-sm text-primary hover:underline">
          {t.auth.backToLogin}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t.invite.title}</h1>
        <p className="text-sm text-muted">{t.invite.intro}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-surface-2 p-3 text-sm">
        <dt className="text-muted">{t.auth.email}</dt>
        <dd className="break-all">{invite.email}</dd>
        <dt className="text-muted">{t.admin.fullName}</dt>
        <dd>{invite.fullName}</dd>
        <dt className="text-muted">{t.invite.role}</dt>
        <dd>{t.roles[invite.role as keyof typeof t.roles]}</dd>
      </dl>
      <PasswordForm
        action={acceptInviteAction}
        hidden={{ token }}
        labels={{
          password: t.auth.password,
          confirm: t.auth.confirmPassword,
          rule: t.auth.passwordRule,
          submit: t.invite.accept,
          pending: t.common.loading,
        }}
        extra={
          <Field label={t.invite.nickname} htmlFor="nickname">
            <Input id="nickname" name="nickname" maxLength={40} autoComplete="nickname" />
          </Field>
        }
      />
    </Card>
  );
}
