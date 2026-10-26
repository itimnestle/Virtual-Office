"use client";

import { useActionState, useState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { createTask } from "./actions";

export type TeamOption = {
  id: string;
  name: string;
  /** Who this viewer may assign in this team ("self" = only themselves). */
  scope: "self" | "team";
  members: { id: string; name: string }[];
};

type Labels = {
  title: string;
  description: string;
  assignees: string;
  assigneesHint: string;
  priority: string;
  size: string;
  estimatedHours: string;
  due: string;
  private: string;
  urgent: string;
  category: string;
  team: string;
  submit: string;
  pending: string;
  none: string;
  priorities: Record<"low" | "medium" | "high", string>;
};

export function CreateTaskForm({
  teams,
  categories,
  viewerId,
  canMarkUrgent,
  labels,
}: {
  teams: TeamOption[];
  categories: { id: string; name: string }[];
  viewerId: string;
  canMarkUrgent: boolean;
  labels: Labels;
}) {
  const [state, action] = useActionState(createTask, undefined);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const team = teams.find((x) => x.id === teamId);
  const assignable = team?.scope === "team" ? team.members : (team?.members ?? []).filter((m) => m.id === viewerId);

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label={labels.title} htmlFor="title">
          <Input id="title" name="title" required maxLength={200} />
        </Field>
      </div>
      {teams.length > 1 ? (
        <Field label={labels.team} htmlFor="teamId">
          <Select id="teamId" name="teamId" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="teamId" value={teamId} />
      )}
      <fieldset className="flex flex-col gap-1.5 md:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">{labels.assignees}</legend>
        <div className="flex flex-wrap gap-2">
          {assignable.map((m) => (
            <label key={m.id} className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
              <input type="checkbox" name="assigneeIds" value={m.id} defaultChecked={team?.scope === "self"} />
              {m.name}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">{labels.assigneesHint}</p>
      </fieldset>
      <div className="md:col-span-2">
        <Field label={labels.description} htmlFor="description">
          <Textarea id="description" name="description" maxLength={20000} />
        </Field>
      </div>
      <Field label={labels.priority} htmlFor="priority">
        <Select id="priority" name="priority" defaultValue="medium">
          {(["low", "medium", "high"] as const).map((p) => (
            <option key={p} value={p}>
              {labels.priorities[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={labels.size} htmlFor="size">
        <Select id="size" name="size" defaultValue="">
          <option value="">{labels.none}</option>
          {["xs", "s", "m", "l", "xl"].map((s) => (
            <option key={s} value={s}>
              {s.toUpperCase()}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={labels.estimatedHours} htmlFor="estimatedHours">
        <Input id="estimatedHours" name="estimatedHours" type="number" min={0} max={2000} step={0.5} inputMode="decimal" />
      </Field>
      <Field label={labels.due} htmlFor="dueLocal">
        <Input id="dueLocal" name="dueLocal" type="datetime-local" />
      </Field>
      {categories.length ? (
        <Field label={labels.category} htmlFor="categoryId">
          <Select id="categoryId" name="categoryId" defaultValue="">
            <option value="">{labels.none}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <div className="flex flex-col gap-2 md:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPrivate" /> {labels.private}
        </label>
        {canMarkUrgent ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isUrgent" /> {labels.urgent}
          </label>
        ) : null}
      </div>
      {state?.error ? (
        <div className="md:col-span-2">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}
      <div className="md:col-span-2">
        <SubmitButton pendingLabel={labels.pending}>{labels.submit}</SubmitButton>
      </div>
    </form>
  );
}
