import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { PasswordForm } from "@/components/password-form";
import { getRequestDictionary, hasSession } from "@/lib/auth/session";
import { updatePassword } from "../actions";

export const metadata = { title: "Set a new password" };

/** Reached from the recovery email via /auth/confirm, which creates the session. */
export default async function ResetPasswordPage() {
  if (!(await hasSession())) redirect("/forgot-password?error=link");
  const t = await getRequestDictionary();
  return (
    <Card className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t.auth.newPasswordTitle}</h1>
      <PasswordForm
        action={updatePassword}
        labels={{
          password: t.auth.password,
          confirm: t.auth.confirmPassword,
          rule: t.auth.passwordRule,
          submit: t.auth.savePassword,
          pending: t.common.loading,
        }}
      />
    </Card>
  );
}
