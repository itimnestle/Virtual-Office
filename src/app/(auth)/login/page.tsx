import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { getRequestDictionary, getViewer } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  if (await getViewer()) redirect("/office");
  const [t, params] = await Promise.all([getRequestDictionary(), searchParams]);
  return (
    <Card className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t.auth.loginTitle}</h1>
      {params.reason === "inactive" ? <Alert>{t.auth.inactive}</Alert> : null}
      <LoginForm
        next={params.next ?? "/office"}
        labels={{ email: t.auth.email, password: t.auth.password, submit: t.auth.login, pending: t.common.loading }}
      />
      <div className="flex flex-col gap-1 text-sm">
        <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
          {t.auth.forgot}
        </Link>
        <p className="text-muted">{t.auth.inviteOnly}</p>
      </div>
    </Card>
  );
}
