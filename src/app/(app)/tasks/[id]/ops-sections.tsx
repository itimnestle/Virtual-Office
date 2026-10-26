import { Artwork } from "@/components/artwork";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { Viewer } from "@/lib/auth/session";
import { displayName, type Person, type TaskDetail } from "@/lib/data/tasks";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { BUSINESS_TZ, formatBangkok } from "@/lib/time";
import {
  addCommentAction,
  decideExtensionAction,
  requestExtensionAction,
  setRecurrenceAction,
  stopRecurrenceAction,
  updateDetailsAction,
} from "../ops-actions";

/** "2026-10-30T17:00" in Bangkok time for datetime-local defaults. */
function toBangkokLocal(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export function TaskOpsSections({
  detail,
  viewer,
  people,
  mentionable,
  isLead,
  t,
}: {
  detail: TaskDetail;
  viewer: Viewer;
  people: Map<string, Person>;
  mentionable: string[];
  isLead: boolean;
  t: Dictionary;
}) {
  const { task, changeRequests, comments, recurrence, isReviewer } = detail;
  const archived = Boolean(task.archived_at);
  const closed = archived || task.status === "completed" || task.status === "cancelled";
  const isAssignee = detail.assignees.some((a) => a.user_id === viewer.id);
  const pending = changeRequests.find((r) => r.status === "pending");
  const hidden = <input type="hidden" name="taskId" value={task.id} />;
  const canRecur = !archived && !task.recurrence_rule_id && (isLead || task.created_by === viewer.id);

  return (
    <>
      {/* Deadline extension */}
      {pending ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">{t.ops.pendingTitle}</h2>
          <Alert tone="warning">{t.ops.pendingNote}</Alert>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">{t.ops.requestedBy}</dt>
            <dd>{displayName(people.get(pending.requested_by))}</dd>
            <dt className="text-muted">{t.ops.from}</dt>
            <dd>{formatBangkok(pending.current_due_at, viewer.locale)}</dd>
            <dt className="text-muted">{t.ops.to}</dt>
            <dd className="font-medium">{formatBangkok(pending.proposed_due_at, viewer.locale)}</dd>
            <dt className="text-muted">{t.ops.reason}</dt>
            <dd className="whitespace-pre-wrap">{pending.reason}</dd>
          </dl>
          {isReviewer && !archived ? (
            <ActionForm
              action={decideExtensionAction}
              submitLabel={t.ops.approve}
              submitName="decision"
              submitValue="approve"
              extraButtons={
                <button
                  type="submit"
                  name="decision"
                  value="reject"
                  className="min-h-10 rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium hover:bg-border/60"
                >
                  {t.ops.reject}
                </button>
              }
            >
              {hidden}
              <input type="hidden" name="requestId" value={pending.id} />
              <Field label={t.ops.decisionNote} htmlFor="decision-note">
                <Input id="decision-note" name="note" maxLength={2000} />
              </Field>
            </ActionForm>
          ) : null}
        </Card>
      ) : isAssignee && !closed ? (
        <Card>
          <details>
            <summary className="cursor-pointer font-semibold">{t.ops.extension}</summary>
            <ActionForm action={requestExtensionAction} submitLabel={t.ops.request} className="pt-3">
              {hidden}
              <Field label={t.ops.newDue} htmlFor="ext-due">
                <Input id="ext-due" name="newDue" type="datetime-local" required defaultValue={toBangkokLocal(task.due_at)} />
              </Field>
              <Field label={t.ops.reason} htmlFor="ext-reason">
                <Textarea id="ext-reason" name="reason" required maxLength={2000} rows={2} />
              </Field>
            </ActionForm>
          </details>
        </Card>
      ) : null}

      {/* Lead adjustments */}
      {isLead && !archived ? (
        <Card>
          <details>
            <summary className="cursor-pointer font-semibold">{t.ops.details}</summary>
            <ActionForm action={updateDetailsAction} submitLabel={t.ops.saveDetails} className="pt-3">
              {hidden}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t.tasks.due} htmlFor="d-due">
                  <Input id="d-due" name="due" type="datetime-local" defaultValue={toBangkokLocal(task.due_at)} />
                </Field>
                <Field label={t.tasks.priority} htmlFor="d-priority">
                  <Select id="d-priority" name="priority" defaultValue={task.priority}>
                    {(["low", "medium", "high"] as const).map((p) => (
                      <option key={p} value={p}>
                        {t.priority[p]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t.tasks.size} htmlFor="d-size">
                  <Select id="d-size" name="size" defaultValue={task.size ?? ""}>
                    <option value="">{t.tasks.none}</option>
                    {(["xs", "s", "m", "l", "xl"] as const).map((s) => (
                      <option key={s} value={s}>
                        {t.size[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t.tasks.estimatedHours} htmlFor="d-hours">
                  <Input id="d-hours" name="estimatedHours" type="number" min={0} max={2000} step={0.5} defaultValue={task.estimated_hours ?? ""} />
                </Field>
                <Field label={t.ops.reminderDays} htmlFor="d-reminder">
                  <Input id="d-reminder" name="reminderDays" type="number" min={0} max={30} defaultValue={task.reminder_days} />
                </Field>
              </div>
            </ActionForm>
          </details>
        </Card>
      ) : null}

      {/* Recurrence */}
      {task.recurrence_rule_id ? (
        <p className="text-sm text-muted"><Artwork name="repeat" size={17} className="inline-block align-middle" /> {t.ops.recurringInstance}</p>
      ) : canRecur || recurrence ? (
        <Card>
          <details open={Boolean(recurrence?.active)}>
            <summary className="cursor-pointer font-semibold">
              <Artwork name="repeat" size={17} className="inline-block align-middle" /> {t.ops.recurrence}
              {recurrence?.active ? (
                <span className="ml-2 text-xs font-normal text-muted">
                  {t.ops.freqs[recurrence.freq]} · {t.ops.nextRun}: {recurrence.next_run_on ?? "—"}
                </span>
              ) : null}
            </summary>
            {canRecur ? (
              <ActionForm
                action={setRecurrenceAction}
                submitLabel={t.ops.saveRecurrence}
                className="pt-3"
              >
                {hidden}
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t.ops.freq} htmlFor="r-freq">
                    <Select id="r-freq" name="freq" defaultValue={recurrence?.freq ?? "weekly"}>
                      {(["daily", "weekly", "monthly", "yearly", "custom"] as const).map((f) => (
                        <option key={f} value={f}>
                          {t.ops.freqs[f]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t.ops.every} htmlFor="r-interval">
                    <Input id="r-interval" name="interval" type="number" min={1} max={365} defaultValue={recurrence?.interval_n ?? 1} />
                  </Field>
                  <Field label={t.ops.dueTime} htmlFor="r-time">
                    <Input id="r-time" name="dueTime" type="time" defaultValue={(recurrence?.due_time ?? "17:00").slice(0, 5)} />
                  </Field>
                </div>
                <fieldset>
                  <legend className="mb-1 text-sm font-medium">{t.ops.weekdays}</legend>
                  <div className="flex flex-wrap gap-2">
                    {t.ops.weekdayNames.map((name, i) => (
                      <label key={name} className="flex min-h-9 items-center gap-1 rounded-lg border border-border px-2 text-sm">
                        <input type="checkbox" name="weekdays" value={i + 1} defaultChecked={recurrence?.weekdays.includes(i + 1)} /> {name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t.ops.dayOfMonth} htmlFor="r-dom">
                    <Input id="r-dom" name="dayOfMonth" type="number" min={1} max={31} defaultValue={recurrence?.day_of_month ?? ""} />
                  </Field>
                  <Field label={t.ops.until} htmlFor="r-until">
                    <Input id="r-until" name="until" type="date" defaultValue={recurrence?.until_on ?? ""} />
                  </Field>
                </div>
              </ActionForm>
            ) : null}
            {canRecur && recurrence?.active ? (
              <ActionForm action={stopRecurrenceAction} submitLabel={t.ops.stopRecurrence} submitVariant="ghost" className="pt-2">
                {hidden}
              </ActionForm>
            ) : null}
          </details>
        </Card>
      ) : null}

      {/* Comments + @mentions */}
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.ops.comments}</h2>
        {comments.length === 0 ? <p className="text-sm text-muted">{t.ops.noComments}</p> : null}
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-surface-2 p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-medium text-text">{displayName(people.get(c.author_id))}</span>
                <span>{formatBangkok(c.created_at, viewer.locale)}</span>
                {c.mentions.map((m) => (
                  <Badge key={m} tone="primary">
                    @{people.get(m)?.nickname ?? people.get(m)?.full_name ?? "?"}
                  </Badge>
                ))}
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
        {!archived ? (
          <ActionForm action={addCommentAction} submitLabel={t.ops.post}>
            {hidden}
            <Textarea name="body" required maxLength={5000} rows={3} placeholder={t.ops.commentPlaceholder} aria-label={t.ops.comments} />
            <fieldset>
              <legend className="mb-1 text-xs text-muted">{t.ops.mention}</legend>
              <div className="flex flex-wrap gap-2">
                {mentionable
                  .filter((id) => id !== viewer.id)
                  .map((id) => (
                    <label
                      key={id}
                      className="flex min-h-9 items-center gap-1 rounded-lg border border-border px-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                    >
                      <input type="checkbox" name="mentions" value={id} /> @{people.get(id)?.nickname ?? people.get(id)?.full_name}
                    </label>
                  ))}
              </div>
            </fieldset>
          </ActionForm>
        ) : null}
      </Card>

      {changeRequests.some((r) => r.status !== "pending") ? (
        <Card>
          <h2 className="mb-2 font-semibold">{t.ops.history}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {changeRequests
              .filter((r) => r.status !== "pending")
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.status === "approved" ? "ok" : "neutral"}>{t.ops.requestStatus[r.status]}</Badge>
                  <span>
                    {formatBangkok(r.current_due_at, viewer.locale)} → {formatBangkok(r.proposed_due_at, viewer.locale)}
                  </span>
                  <span className="text-muted">
                    {displayName(people.get(r.requested_by))}: {r.reason}
                  </span>
                  {r.decision_note ? <span className="text-muted">· {r.decision_note}</span> : null}
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
