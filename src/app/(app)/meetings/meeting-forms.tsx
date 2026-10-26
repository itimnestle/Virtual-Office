"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { addMeetingNotesAction, assignItemAction, createMeetingAction } from "./actions";
import { SuggestionPanel, type SuggestInput, type SuggestLabels } from "./suggestions";

export type TeamPeople = { id: string; name: string; members: { id: string; name: string }[] };

export function CreateMeetingForm({
  teams,
  viewerId,
  labels,
}: {
  teams: TeamPeople[];
  viewerId: string;
  labels: Record<
    "title" | "team" | "startsAt" | "endsAt" | "summary" | "attendees" | "proxy" | "proxyHint" | "actionItems" | "save" | "pending",
    string
  >;
}) {
  const [state, action] = useActionState(createMeetingAction, undefined);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const team = teams.find((x) => x.id === teamId);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label={labels.title} htmlFor="m-title">
          <Input id="m-title" name="title" required maxLength={200} />
        </Field>
      </div>
      {teams.length > 1 ? (
        <Field label={labels.team} htmlFor="m-team">
          <Select id="m-team" name="teamId" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
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
      <Field label={labels.startsAt} htmlFor="m-start">
        <Input id="m-start" name="startsAt" type="datetime-local" required />
      </Field>
      <Field label={labels.endsAt} htmlFor="m-end">
        <Input id="m-end" name="endsAt" type="datetime-local" required />
      </Field>
      <fieldset className="md:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">{labels.attendees}</legend>
        <ul className="grid gap-2 sm:grid-cols-2">
          {(team?.members ?? [])
            .filter((m) => m.id !== viewerId)
            .map((m) => (
              <li key={m.id} className="flex min-h-10 items-center justify-between gap-2 rounded-xl border border-border px-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="attendees" value={m.id} /> {m.name}
                </label>
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input type="checkbox" name="proxies" value={m.id} /> {labels.proxy}
                </label>
              </li>
            ))}
        </ul>
        <p className="mt-1 text-xs text-muted">{labels.proxyHint}</p>
      </fieldset>
      <div className="md:col-span-2">
        <Field label={labels.summary} htmlFor="m-summary">
          <Textarea id="m-summary" name="summary" maxLength={50000} rows={5} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label={labels.actionItems} htmlFor="m-items">
          <Textarea id="m-items" name="actionItems" rows={4} />
        </Field>
      </div>
      {state?.error ? (
        <div className="md:col-span-2">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}
      <div className="md:col-span-2">
        <SubmitButton pendingLabel={labels.pending}>{labels.save}</SubmitButton>
      </div>
    </form>
  );
}

export function MeetingNotesForm({ meetingId, labels }: { meetingId: string; labels: Record<"note" | "items" | "submit" | "pending", string> }) {
  const [state, action] = useActionState(addMeetingNotesAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="meetingId" value={meetingId} />
      <Field label={labels.note} htmlFor="n-note">
        <Textarea id="n-note" name="note" rows={3} maxLength={10000} />
      </Field>
      <Field label={labels.items} htmlFor="n-items">
        <Textarea id="n-items" name="actionItems" rows={3} />
      </Field>
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.message ? <Alert tone="ok">{state.message}</Alert> : null}
      <SubmitButton variant="secondary" pendingLabel={labels.pending} className="self-start">
        {labels.submit}
      </SubmitButton>
    </form>
  );
}

export type Candidate = { id: string; name: string; workload: string; onLeave: boolean };

export function AssignItemForm({
  itemId,
  teamId,
  candidates,
  canUrgent,
  skills,
  suggestLabels,
  labels,
}: {
  itemId: string;
  teamId: string;
  candidates: Candidate[];
  canUrgent: boolean;
  skills: { id: string; name: string }[];
  suggestLabels: SuggestLabels;
  labels: {
    assign: string;
    pending: string;
    due: string;
    priority: string;
    size: string;
    hours: string;
    private: string;
    urgent: string;
    onLeave: string;
    none: string;
    priorities: Record<"low" | "medium" | "high", string>;
  };
}) {
  const [state, action] = useActionState(assignItemAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [input, setInput] = useState<SuggestInput>({ size: null, estimatedHours: null, dueLocal: null, skillId: null });
  const names = useMemo(() => new Map(candidates.map((c) => [c.id, c.name])), [candidates]);

  // Re-rank when the work's size, hours or due date change.
  const onFieldChange = () => {
    const f = new FormData(formRef.current!);
    const v = (k: string) => (String(f.get(k) ?? "") || null);
    setInput((prev) => {
      const next = { ...prev, size: v("size"), estimatedHours: v("estimatedHours"), dueLocal: v("dueLocal") };
      return next.size === prev.size && next.estimatedHours === prev.estimatedHours && next.dueLocal === prev.dueLocal ? prev : next;
    });
  };
  const pick = (userId: string) => {
    const box = formRef.current?.querySelector<HTMLInputElement>(`input[name="assigneeIds"][value="${userId}"]`);
    if (box) box.checked = true;
  };

  if (state?.message === "ok") return null; // assigned: the item leaves the inbox on refresh
  return (
    <form ref={formRef} action={action} onChange={onFieldChange} className="flex flex-col gap-3">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex flex-wrap gap-2">
        {candidates.map((c) => (
          <label
            key={c.id}
            className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 py-1 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
          >
            <input type="checkbox" name="assigneeIds" value={c.id} />
            <span>
              {c.name}
              <span className="block text-xs text-muted">
                {c.workload}
                {c.onLeave ? ` · ${labels.onLeave}` : ""}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={labels.due} htmlFor={`due-${itemId}`}>
          <Input id={`due-${itemId}`} name="dueLocal" type="datetime-local" />
        </Field>
        <Field label={labels.priority} htmlFor={`pr-${itemId}`}>
          <Select id={`pr-${itemId}`} name="priority" defaultValue="medium">
            {(["low", "medium", "high"] as const).map((p) => (
              <option key={p} value={p}>
                {labels.priorities[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels.size} htmlFor={`sz-${itemId}`}>
          <Select id={`sz-${itemId}`} name="size" defaultValue="">
            <option value="">{labels.none}</option>
            {["xs", "s", "m", "l", "xl"].map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels.hours} htmlFor={`h-${itemId}`}>
          <Input id={`h-${itemId}`} name="estimatedHours" type="number" min={0} max={2000} step={0.5} inputMode="decimal" />
        </Field>
      </div>
      <SuggestionPanel
        teamId={teamId}
        input={input}
        names={names}
        skills={skills}
        labels={suggestLabels}
        onPick={pick}
        onSkill={(skillId) => setInput((prev) => ({ ...prev, skillId }))}
      />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isPrivate" /> {labels.private}
        </label>
        {canUrgent ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isUrgent" /> {labels.urgent}
          </label>
        ) : null}
      </div>
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingLabel={labels.pending} className="self-start">
        {labels.assign}
      </SubmitButton>
    </form>
  );
}
