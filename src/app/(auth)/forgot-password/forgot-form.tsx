"use client";

import { useActionState } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { requestPasswordReset } from "../actions";

export function ForgotForm({
  linkError,
  labels,
}: {
  linkError?: string;
  labels: { email: string; submit: string; pending: string };
}) {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {linkError && !state ? <Alert>{linkError}</Alert> : null}
      <Field label={labels.email} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      {state?.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton pendingLabel={labels.pending}>{labels.submit}</SubmitButton>
    </form>
  );
}
