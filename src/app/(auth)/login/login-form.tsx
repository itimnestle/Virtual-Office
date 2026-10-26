"use client";

import { useActionState } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { signIn } from "../actions";

export function LoginForm({
  next,
  labels,
}: {
  next: string;
  labels: { email: string; password: string; submit: string; pending: string };
}) {
  const [state, action] = useActionState(signIn, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label={labels.email} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label={labels.password} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingLabel={labels.pending}>{labels.submit}</SubmitButton>
    </form>
  );
}
