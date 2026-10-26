"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { createInviteAction } from "./actions";

export function InviteForm({
  teams,
  labels,
}: {
  teams: { id: string; name: string }[];
  labels: {
    email: string;
    fullName: string;
    role: string;
    team: string;
    noTeam: string;
    submit: string;
    pending: string;
    link: string;
    copy: string;
    roles: Record<string, string>;
  };
}) {
  const [state, action] = useActionState(createInviteAction, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <Field label={labels.fullName} htmlFor="inv-name">
          <Input id="inv-name" name="fullName" required maxLength={120} />
        </Field>
        <Field label={labels.email} htmlFor="inv-email">
          <Input id="inv-email" name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label={labels.role} htmlFor="inv-role">
          <Select id="inv-role" name="role" defaultValue="member">
            {Object.entries(labels.roles).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels.team} htmlFor="inv-team">
          <Select id="inv-team" name="teamId" defaultValue={teams[0]?.id ?? ""}>
            <option value="">{labels.noTeam}</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <SubmitButton pendingLabel={labels.pending}>{labels.submit}</SubmitButton>
        </div>
      </form>
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.message ? (
        <div className="flex flex-col gap-2 rounded-xl border border-ok/40 bg-ok/10 p-3">
          <p className="text-sm font-medium">{labels.link}</p>
          <code className="break-all text-xs">{state.message}</code>
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={async () => {
              await navigator.clipboard.writeText(state.message ?? "");
              setCopied(true);
            }}
          >
            {copied ? "✓" : labels.copy}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
