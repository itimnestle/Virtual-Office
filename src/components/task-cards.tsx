import Link from "next/link";
import { Artwork } from "@/components/artwork";
import { Badge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icon";
import { format, type Dictionary, type Locale } from "@/lib/i18n/dictionaries";
import { displayName, type DirectoryRow, type Person } from "@/lib/data/tasks";
import { formatBangkok } from "@/lib/time";

/**
 * Tasks as "quest cards": a status ribbon, the title and chips, then who owns
 * it and how long is left. Private tasks the viewer cannot open stay title-only
 * and are not links (same rule as the list).
 */
const AVATAR_TINTS = ["#7b6ee6", "#2f9a78", "#d9475a", "#3a8fd8", "#c98510", "#c46fd1", "#5f7a8c"];
const DAY = 86_400_000;

function bkkDay(ms: number) {
  return Math.floor((ms + 7 * 3_600_000) / DAY);
}

export function dueInfo(dueAt: string | null, status: string | null, now: number, t: Dictionary) {
  if (!dueAt) return { text: t.tasks.noDue, tone: "none" as const };
  if (status === "completed" || status === "cancelled") return { text: "", tone: "none" as const };
  const days = bkkDay(Date.parse(dueAt)) - bkkDay(now);
  if (Date.parse(dueAt) < now) return { text: format(t.tasks.overdueBy, { n: Math.max(1, -days) }), tone: "late" as const };
  if (days === 0) return { text: t.tasks.dueToday, tone: "soon" as const };
  return { text: format(t.tasks.dueIn, { n: days }), tone: days <= 3 ? ("soon" as const) : ("ok" as const) };
}

export function TaskCards({ rows, people, t, locale, tags = [], now }: {
  rows: DirectoryRow[]; people: Map<string, Person>; t: Dictionary; locale: Locale;
  tags?: { id: string; name: string; color: string }[]; now: number;
}) {
  const tagById = new Map(tags.map((tg) => [tg.id, tg]));
  if (rows.length === 0) return <EmptyState>{t.tasks.empty}</EmptyState>;
  return (
    <ul className="quest-grid">
      {rows.map((row) => {
        if (row.redacted) {
          return <li key={row.id} className="quest-card is-locked" data-status="private">
            <div className="quest-ribbon"><Artwork name="lock" size={16} /><span>{t.badges.private}</span></div>
            <h3 className="quest-title">{row.title}</h3>
            <p className="quest-note">{t.tasks.redactedNote}</p>
          </li>;
        }
        const due = dueInfo(row.due_at, row.status, now, t);
        const owners = (row.assignee_ids ?? []).map((id) => people.get(id)).filter((p): p is Person => Boolean(p));
        return <li key={row.id} className="quest-card" data-status={row.status ?? undefined} data-urgent={row.is_urgent || undefined}>
          <Link href={`/tasks/${row.id}`} className="quest-link" aria-label={`${t.tasks.open}: ${row.title}`}>
            <div className="quest-ribbon">
              <span className="quest-dot" aria-hidden />
              <span>{row.status ? t.status[row.status] : ""}</span>
              {row.size ? <span className="quest-size">{t.size[row.size]}</span> : null}
              {row.is_private ? <span className="quest-lock" title={t.badges.private}><Artwork name="lock" size={15} /></span> : null}
            </div>
            <h3 className="quest-title">{row.title}</h3>
            <div className="quest-chips">
              {row.is_urgent ? <Badge tone="danger">{t.badges.urgent}</Badge> : null}
              {row.is_new_today ? <Badge tone="accent">{t.badges.newToday}</Badge> : null}
              {row.has_pending_extension ? <Badge tone="warning">{t.badges.pendingExtension}</Badge> : null}
              {row.assignee_absent_today ? <Badge>{t.badges.waitingReturn}</Badge> : null}
              {row.is_recurring ? <Badge><Artwork name="repeat" size={14} className="inline-block align-middle" /> {t.badges.recurring}</Badge> : null}
              {(row.tag_ids ?? []).map((id) => {
                const tg = tagById.get(id);
                return tg ? <span key={id} className="quest-tag" style={{ background: tg.color }}>#{tg.name}</span> : null;
              })}
            </div>
            <div className="quest-foot">
              <span className="quest-owners" title={owners.map((p) => displayName(p)).join(", ") || t.tasks.unassigned}>
                {owners.length ? owners.slice(0, 4).map((p, i) => <span key={p.id} className="quest-avatar" style={{ background: AVATAR_TINTS[(p.id.charCodeAt(0) + i) % AVATAR_TINTS.length] }}>{Array.from(displayName(p))[0]}</span>)
                  : <span className="quest-avatar is-empty">?</span>}
                {owners.length > 4 ? <span className="quest-avatar is-more">+{owners.length - 4}</span> : null}
                <small>{owners.length ? displayName(owners[0]) + (owners.length > 1 ? ` +${owners.length - 1}` : "") : t.tasks.unassigned}</small>
              </span>
              <span className={`quest-due is-${due.tone}`}>
                <Icon name="clock" size={14} />
                <span>{row.due_at ? formatBangkok(row.due_at, locale) : ""}{due.text ? <em>{due.text}</em> : null}</span>
              </span>
            </div>
          </Link>
        </li>;
      })}
    </ul>
  );
}
