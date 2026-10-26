import { Artwork } from "@/components/artwork";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { requireViewer } from "@/lib/auth/session";
import { displayName, getPeople, getTaskDetail, getTaskDirectory } from "@/lib/data/tasks";
import { format, getDictionary } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { formatBangkok } from "@/lib/time";
import { SUBMITTABLE, allowedTransitions } from "@/lib/workflow";
import { changeStatusAction } from "../actions";
import { TaskExtrasSections } from "./extras-sections";
import { TaskOpsSections } from "./ops-sections";
import { ReviewForm, SubmitWorkForm } from "./task-actions";

export const metadata = { title: "Task" };

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [detail, people] = await Promise.all([getTaskDetail(supabase, id), getPeople(supabase)]);

  const back = (
    <Link href="/tasks" className="text-sm text-primary hover:underline">
      ← {t.tasks.back}
    </Link>
  );

  if (!detail) {
    // The directory is the only place a redacted title may come from.
    const redacted = (await getTaskDirectory(supabase)).find((r) => r.id === id && r.redacted);
    if (!redacted) notFound();
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Card className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold"><Artwork name="lock" size={17} className="inline-block align-middle" /> {redacted.title}</h1>
          <p className="text-sm text-muted">{t.tasks.redactedNote}</p>
        </Card>
      </div>
    );
  }

  const { task, assignees, audit, submissions, reviews, attachments, sourceMeeting, canReview } = detail;
  const archived = Boolean(task.archived_at);
  const isAssignee = assignees.some((a) => a.user_id === viewer.id);
  const isLead =
    viewer.role === "director" || viewer.role === "admin" || viewer.teams.some((v) => v.teamId === task.team_id && v.isLead);
  const transitions = archived || !(isAssignee || isLead) ? [] : allowedTransitions(task.status, { isLead });
  const canSubmit = !archived && isAssignee && SUBMITTABLE.includes(task.status);
  const latest = submissions[0];

  // Who may be @mentioned: only people who can open this task (the DB re-checks).
  const [{ data: teamRows }, { data: tagRows }, { data: categoryRows }] = await Promise.all([
    supabase.from("team_members").select("user_id, is_lead").eq("team_id", task.team_id),
    supabase.from("task_tags").select("id, name, color, is_active").order("name"),
    supabase.from("task_categories").select("id, name_th, name_en, is_active").order("sort_order"),
  ]);
  const canEdit = isAssignee || isLead || task.created_by === viewer.id;
  const directors = [...people.values()].filter((p) => p.is_active && (p.role === "director" || p.role === "admin")).map((p) => p.id);
  const mentionable = [
    ...new Set(
      task.is_private
        ? [...assignees.map((a) => a.user_id), task.created_by, ...(teamRows ?? []).filter((r) => r.is_lead).map((r) => r.user_id), ...directors]
        : [...(teamRows ?? []).map((r) => r.user_id), ...directors],
    ),
  ].filter((id) => people.get(id)?.is_active && people.get(id)?.role !== "admin");

  return (
    <div className="flex flex-col gap-4">
      {back}
      {error ? <Alert>{t.errors[error] ?? t.errors.generic}</Alert> : null}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {task.is_private ? <Badge><Artwork name="lock" size={17} className="inline-block align-middle" /> {t.badges.private}</Badge> : null}
          {task.is_urgent ? <Badge tone="danger">{t.badges.urgent}</Badge> : null}
          <Badge tone="primary">{t.status[task.status]}</Badge>
          {detail.changeRequests.some((r) => r.status === "pending") ? <Badge tone="warning">{t.badges.pendingExtension}</Badge> : null}
          {detail.recurrence?.active || task.recurrence_rule_id ? <Badge><Artwork name="repeat" size={17} className="inline-block align-middle" /> {t.badges.recurring}</Badge> : null}
          {task.status === "in_review" && latest ? (
            <Badge tone="warning">{format(t.taskActions.awaiting, { who: t.taskActions.reviewer[latest.review_level] })}</Badge>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold break-words">{task.title}</h1>
        {archived ? <Alert tone="ok">{t.taskActions.archivedNote}</Alert> : null}
        {task.description ? <p className="text-sm whitespace-pre-wrap">{task.description}</p> : null}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">{t.tasks.owners}</dt>
          <dd className="flex flex-wrap gap-2">
            {assignees.map((a) => (
              <span key={a.user_id}>
                {displayName(people.get(a.user_id))}
                {a.is_primary ? <span className="text-xs text-muted"> · {t.tasks.primary}</span> : null}
              </span>
            ))}
          </dd>
          <dt className="text-muted">{t.tasks.priority}</dt>
          <dd>{t.priority[task.priority]}</dd>
          <dt className="text-muted">{t.tasks.size}</dt>
          <dd>{task.size ? t.size[task.size] : "—"}</dd>
          <dt className="text-muted">{t.tasks.estimatedHours}</dt>
          <dd>{task.estimated_hours ?? "—"}</dd>
          <dt className="text-muted">{t.tasks.dueCol}</dt>
          <dd>{formatBangkok(task.due_at, viewer.locale)}</dd>
          {sourceMeeting ? (
            <>
              <dt className="text-muted">{t.taskActions.fromMeeting}</dt>
              <dd>
                <Link href={`/meetings/${sourceMeeting.id}`} className="text-primary hover:underline">
                  {sourceMeeting.title}
                </Link>
              </dd>
            </>
          ) : null}
        </dl>
        {transitions.length ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="text-sm text-muted">{t.taskActions.to}:</span>
            {transitions.map((s) => (
              <form key={s} action={changeStatusAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="status" value={s} />
                <SubmitButton variant={s === "cancelled" ? "ghost" : "secondary"} className="min-h-9">
                  {t.status[s]}
                </SubmitButton>
              </form>
            ))}
          </div>
        ) : null}
      </Card>

      {canSubmit ? (
        <Card>
          <SubmitWorkForm
            taskId={task.id}
            orgId={task.org_id}
            labels={{
              title: t.taskActions.submit,
              note: t.taskActions.note,
              files: t.taskActions.files,
              send: t.taskActions.send,
              uploading: t.taskActions.uploading,
              tooLarge: t.errors.file_too_large,
              uploadFailed: t.errors.attachment_not_uploaded,
            }}
          />
        </Card>
      ) : null}

      {canReview && latest ? (
        <Card>
          <ReviewForm
            taskId={task.id}
            labels={{
              title: t.taskActions.review,
              awaiting: t.taskActions.reviewer[latest.review_level],
              comment: t.taskActions.reviewNote,
              approve: t.taskActions.approve,
              revise: t.taskActions.revise,
              pending: t.common.loading,
            }}
          />
        </Card>
      ) : null}

      <TaskExtrasSections
        detail={detail}
        viewer={viewer}
        people={people}
        canEdit={canEdit}
        canSetCategory={isLead || task.created_by === viewer.id}
        tags={tagRows ?? []}
        categories={(categoryRows ?? [])
          .filter((c) => c.is_active || c.id === task.category_id)
          .map((c) => ({ id: c.id, name: viewer.locale === "th" ? c.name_th : c.name_en }))}
        t={t}
      />

      <TaskOpsSections detail={detail} viewer={viewer} people={people} mentionable={mentionable} isLead={isLead} t={t} />

      {submissions.length ? (
        <Card>
          <h2 className="mb-3 font-semibold">{t.taskActions.submissions}</h2>
          <ol className="flex flex-col gap-4">
            {submissions.map((s) => {
              const review = reviews.find((r) => r.submission_id === s.id);
              const files = attachments.filter((a) => a.submission_id === s.id);
              return (
                <li key={s.id} className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-muted">
                    <span>{formatBangkok(s.created_at, viewer.locale)}</span>
                    <span className="text-text">{displayName(people.get(s.submitted_by))}</span>
                    <Badge>{t.taskActions.reviewer[s.review_level]}</Badge>
                  </div>
                  {s.note ? <p className="whitespace-pre-wrap">{s.note}</p> : null}
                  {files.length ? (
                    <ul className="flex flex-wrap gap-2">
                      {files.map((f) => (
                        <li key={f.id}>
                          <a
                            href={`/tasks/${task.id}/files/${f.id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-primary hover:underline"
                          >
                            <Artwork name="attachment" size={17} className="inline-block align-middle" /> {f.file_name} <span className="text-xs text-muted">v{f.version}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {review ? (
                    <div className="rounded-lg bg-surface-2 p-2">
                      <Badge tone={review.decision === "approved" ? "ok" : "accent"}>{t.taskActions.decision[review.decision]}</Badge>{" "}
                      <span className="text-muted">{displayName(people.get(review.reviewer_id))}</span>
                      {review.comment ? <p className="mt-1 whitespace-pre-wrap">{review.comment}</p> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 font-semibold">{t.tasks.history}</h2>
        <ol className="flex flex-col gap-2 text-sm">
          {audit.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-2">
              <span className="text-muted">{formatBangkok(a.created_at, viewer.locale)}</span>
              <span>{displayName(people.get(a.actor_id ?? ""))}</span>
              <Badge>{a.action}</Badge>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
