import { Artwork } from "@/components/artwork";
import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { displayName, type DirectoryRow, type Person } from "@/lib/data/tasks";
import { formatBangkok } from "@/lib/time";

const STATUS_TONE: Record<string, "neutral" | "primary" | "accent" | "danger" | "warning" | "ok"> = {
  not_started: "neutral",
  in_progress: "primary",
  blocked: "danger",
  in_review: "warning",
  revision_required: "accent",
  completed: "ok",
  paused: "neutral",
  cancelled: "neutral",
};

export function TaskList({
  rows,
  people,
  t,
  locale,
  tags = [],
}: {
  rows: DirectoryRow[];
  people: Map<string, Person>;
  t: Dictionary;
  locale: Locale;
  tags?: { id: string; name: string; color: string }[];
}) {
  const tagById = new Map(tags.map((tg) => [tg.id, tg]));
  if (rows.length === 0) return <EmptyState>{t.tasks.empty}</EmptyState>;
  return (
    <ul className="game-list divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {rows.map((row) => (
        <li key={row.id} className="game-row" data-status={row.redacted ? "private" : row.status ?? undefined} data-urgent={row.is_urgent || undefined}>
          {row.redacted ? (
            // Private task the viewer cannot open: title only, no link to detail.
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span aria-hidden><Artwork name="lock" size={17} className="inline-block align-middle" /></span>
              <span className="font-medium">{row.title}</span>
              <Badge>{t.badges.private}</Badge>
              <span className="w-full text-xs text-muted">{t.tasks.redactedNote}</span>
            </div>
          ) : (
            <Link href={`/tasks/${row.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {row.is_private ? <span aria-label={t.badges.private}><Artwork name="lock" size={17} className="inline-block align-middle" /></span> : null}
                <span className="font-medium break-words">{row.title}</span>
                {row.is_urgent ? <Badge tone="danger">{t.badges.urgent}</Badge> : null}
                {row.is_new_today ? <Badge tone="accent">{t.badges.newToday}</Badge> : null}
                {row.has_pending_extension ? <Badge tone="warning">{t.badges.pendingExtension}</Badge> : null}
                {row.assignee_absent_today ? <Badge>{t.badges.waitingReturn}</Badge> : null}
                {row.is_recurring ? <Badge><Artwork name="repeat" size={17} className="inline-block align-middle" /> {t.badges.recurring}</Badge> : null}
                {(row.tag_ids ?? []).map((id) => {
                  const tg = tagById.get(id);
                  return tg ? (
                    <span key={id} className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: tg.color }}>
                      #{tg.name}
                    </span>
                  ) : null;
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted sm:justify-end">
                {row.status ? <Badge tone={STATUS_TONE[row.status]}>{t.status[row.status]}</Badge> : null}
                {row.size ? <Badge>{t.size[row.size]}</Badge> : null}
                <span>{(row.assignee_ids ?? []).map((id) => displayName(people.get(id))).join(", ")}</span>
                <span>· {formatBangkok(row.due_at, locale)}</span>
              </div>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
