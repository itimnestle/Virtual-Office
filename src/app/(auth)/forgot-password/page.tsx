import Link from "next/link";
import { Card } from "@/components/ui";
import { getRequestDictionary } from "@/lib/auth/session";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [t, params] = await Promise.all([getRequestDictionary(), searchParams]);
  return (
    <Card className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t.auth.forgotTitle}</h1>
      <ForgotForm
        linkError={params.error === "link" ? t.auth.linkInvalid : undefined}
        labels={{ email: t.auth.email, submit: t.auth.sendReset, pending: t.common.loading }}
      />
      <Link href="/login" className="text-sm text-primary hover:underline">
        {t.auth.backToLogin}
      </Link>
    </Card>
  );
}
