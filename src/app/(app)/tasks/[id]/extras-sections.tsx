import { Artwork } from "@/components/artwork";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-bits";
import { Badge, Card, Input, Select, cn } from "@/components/ui";
import type { Viewer } from "@/lib/auth/session";
import { displayName, type Person, type TaskDetail } from "@/lib/data/tasks";
import { format, type Dictionary } from "@/lib/i18n/dictionaries";
import { formatBangkok } from "@/lib/time";
import {
  addChecklistItemAction,
  removeChecklistItemAction,
  setCategoryAction,
  setChecklistDoneAction,
  setTagsAction,
} from "../ops-actions";
import { AddFilesForm } from "./task-actions";

type Tag = { id: string; name: string; color: string; is_active: boolean };
type Category = { id: string; name: string };

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskExtrasSections({
  detail,
  viewer,
  people,
  canEdit,
  canSetCategory,
  tags,
  categories,
  t,
}: {
  detail: TaskDetail;
  viewer: Viewer;
  people: Map<string, Person>;
  canEdit: boolean;
  canSetCategory: boolean;
  tags: Tag[];
  categories: Category[];
  t: Dictionary;
}) {
  const { task, attachments, checklist, tagIds } = detail;
  const archived = Boolean(task.archived_at);
  const editable = canEdit && !archived;
  const hidden = <input type="hidden" name="taskId" value={task.id} />;
  // RLS already hides older versions from non-admins; the Admin sees all, labelled.
  const latest = new Map<string, number>();
  for (const a of attachments) latest.set(a.file_key, Math.max(latest.get(a.file_key) ?? 0, a.version));
  const tagById = new Map(tags.map((tg) => [tg.id, tg]));

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">{t.extras.files}</h2>
          <p className="text-xs text-muted">{t.extras.filesNote}</p>
        </div>
        {attachments.length === 0 ? <p className="text-sm text-muted">{t.extras.noFiles}</p> : null}
        <ul className="flex flex-col gap-1 text-sm">
          {attachments.map((a) => {
            const old = a.version < (latest.get(a.file_key) ?? 0);
            return (
              <li key={a.id} className={cn("flex flex-wrap items-center gap-2", old && "pl-4 opacity-70")}>
                <a href={`/tasks/${task.id}/files/${a.id}`} className="text-primary hover:underline">
                  <Artwork name="attachment" size={17} className="inline-block align-middle" /> {a.file_name}
                </a>
                <Badge tone={old ? "neutral" : "primary"}>{format(t.extras.version, { n: a.version })}</Badge>
                {old ? <Badge tone="warning">{t.extras.olderVersion}</Badge> : null}
                <span className="text-xs text-muted">
                  {formatSize(a.size_bytes)} · {displayName(people.get(a.uploaded_by))} · {formatBangkok(a.created_at, viewer.locale)}
                </span>
              </li>
            );
          })}
        </ul>
        {editable ? (
          <AddFilesForm
            taskId={task.id}
            orgId={task.org_id}
            labels={{
              upload: t.extras.upload,
              uploading: t.taskActions.uploading,
              tooLarge: t.errors.file_too_large,
              uploadFailed: t.errors.attachment_not_uploaded,
            }}
          />
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.extras.checklist}</h2>
        {checklist.length === 0 ? <p className="text-sm text-muted">{t.extras.noItems}</p> : null}
        <ul className="flex flex-col gap-1">
          {checklist.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              {editable ? (
                <form action={setChecklistDoneAction}>
                  {hidden}
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="done" value={item.is_done ? "false" : "true"} />
                  <button
                    type="submit"
                    aria-pressed={item.is_done}
                    aria-label={item.title}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-md border",
                      item.is_done ? "border-primary bg-primary text-primary-fg" : "border-border",
                    )}
                  >
                    {item.is_done ? "✓" : ""}
                  </button>
                </form>
              ) : (
                <span aria-hidden>{item.is_done ? "☑" : "☐"}</span>
              )}
              <span className={cn("flex-1", item.is_done && "text-muted line-through")}>{item.title}</span>
              {editable ? (
                <form action={removeChecklistItemAction}>
                  {hidden}
                  <input type="hidden" name="itemId" value={item.id} />
                  <SubmitButton variant="ghost" className="min-h-8 px-2 text-xs text-muted">
                    {t.extras.remove}
                  </SubmitButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {editable ? (
          <ActionForm action={addChecklistItemAction} submitLabel={t.extras.addItem} submitVariant="secondary">
            {hidden}
            <Input name="title" required maxLength={300} placeholder={t.extras.itemPlaceholder} aria-label={t.extras.addItem} />
          </ActionForm>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">
          {t.extras.category} · {t.extras.tags}
        </h2>
        <div className="flex flex-wrap gap-2">
          {categories.find((c) => c.id === task.category_id) ? (
            <Badge tone="accent">{categories.find((c) => c.id === task.category_id)!.name}</Badge>
          ) : null}
          {tagIds.map((id) => {
            const tg = tagById.get(id);
            return tg ? (
              <span key={id} className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: tg.color }}>
                #{tg.name}
              </span>
            ) : null;
          })}
        </div>
        {canSetCategory && !archived ? (
          <ActionForm action={setCategoryAction} submitLabel={t.extras.saveCategory} submitVariant="secondary">
            {hidden}
            <Select name="categoryId" defaultValue={task.category_id ?? ""} aria-label={t.extras.category}>
              <option value="">{t.tasks.none}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </ActionForm>
        ) : null}
        {editable ? (
          <ActionForm action={setTagsAction} submitLabel={t.extras.saveTags} submitVariant="secondary">
            {hidden}
            <div className="flex flex-wrap gap-2">
              {tags
                .filter((tg) => tg.is_active || tagIds.includes(tg.id))
                .map((tg) => (
                  <label
                    key={tg.id}
                    className="flex min-h-9 items-center gap-1 rounded-lg border border-border px-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                  >
                    <input type="checkbox" name="tagIds" value={tg.id} defaultChecked={tagIds.includes(tg.id)} />
                    <span className="size-2.5 rounded-full" style={{ background: tg.color }} aria-hidden />#{tg.name}
                  </label>
                ))}
            </div>
          </ActionForm>
        ) : null}
      </Card>
    </>
  );
}
