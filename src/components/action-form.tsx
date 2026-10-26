"use client";

import { useActionState, type ReactNode } from "react";
import { Alert, cn } from "@/components/ui";
import { SubmitButton, type ActionState } from "@/components/form-bits";

/**
 * A server-action form with pending state and inline error/success messages.
 * Fields are passed as children from Server Components.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  className,
  submitVariant = "primary",
  extraButtons,
  submitName,
  submitValue,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  children: ReactNode;
  className?: string;
  submitVariant?: "primary" | "secondary" | "ghost" | "danger";
  extraButtons?: ReactNode;
  /** Lets several submit buttons share one form (e.g. approve / decline). */
  submitName?: string;
  submitValue?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={cn("flex flex-col gap-3", className)}>
      {children}
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant={submitVariant} pendingLabel={pendingLabel} name={submitName} value={submitValue}>
          {submitLabel}
        </SubmitButton>
        {extraButtons}
      </div>
    </form>
  );
}
