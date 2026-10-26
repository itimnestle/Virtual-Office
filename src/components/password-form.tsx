"use client";

import { useActionState, type ReactNode } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton, type ActionState } from "@/components/form-bits";

/** New-password form shared by invite acceptance and password reset. */
export function PasswordForm({
  action,
  labels,
  hidden,
  extra,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  labels: { password: string; confirm: string; rule: string; submit: string; pending: string };
  hidden?: Record<string, string>;
  extra?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {extra}
      <Field label={labels.password} htmlFor="password" hint={labels.rule}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} required />
      </Field>
      <Field label={labels.confirm} htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={72} required />
      </Field>
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingLabel={labels.pending}>{labels.submit}</SubmitButton>
    </form>
  );
}
