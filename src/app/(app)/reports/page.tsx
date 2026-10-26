import Link from "next/link";
import { Card, Field, Input, cn } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { BarList } from "@/components/reports/bar-list";
import { requireViewer } from "@/lib/auth/session";
import { getReportData, type ReportParams } from "@/lib/data/reports";
import { format, getDictionary } from "@/lib/i18n/dictionaries";
import { delta, rankPeople, type Period } from "@/lib/reports";
import { TrendChart } from "@/components/reports/trend-chart";
import { StatusDonut } from "@/components/reports/status-donut";
import { Artwork } from "@/components/artwork";
import { Icon, type IconName } from "@/components/icon";
import { createClient } from "@/lib/supabase/server";
import "../../reports.css";
import "../../reports-game.css";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportParams> }) {
  const viewer = await requireViewer();
  const t = getDictionary(viewer.locale);
  const params = await searchParams;
  const supabase = await createClient();
  const { period, range, report, previous, trend, mix, categories } = await getReportData(supabase, params);
  const categoryName = new Map(categories.map((c) => [c.id, viewer.locale === "th" ? c.name_th : c.name_en]));
  const { tiles } = report;
  const qs = new URLSearchParams({ period, ...(period === "custom" ? range : {}) }).toString();
  const isAdmin = viewer.role === "admin";
  const ranked = isAdmin ? rankPeople(report.byPerson) : [];
  const chartLabels = { tableLabel: t.reports.showTable, emptyLabel: t.reports.empty };

  // KPI tiles: value, change vs the previous period of the same length, and whether "up" is good.
  const kpis: { key: string; icon: IconName; tone: string; label: string; value: string; change: number | null; points?: boolean; better: "up" | "down" | "none"; note?: string }[] = [
    { key: "open", icon: "tasks", tone: "blue", label: t.reports.tiles.open, value: String(tiles.open), change: delta(tiles.open, previous.open), better: "none", note: `${t.reports.tiles.urgentOpen}: ${tiles.urgentOpen}` },
    { key: "review", icon: "hourglass", tone: "amber", label: t.reports.tiles.inReview, value: String(tiles.inReview), change: delta(tiles.inReview, previous.inReview), better: "none" },
    { key: "overdue", icon: "alert", tone: "red", label: t.reports.tiles.overdue, value: String(tiles.overdue), change: delta(tiles.overdue, previous.overdue), better: "down" },
    { key: "done", icon: "check", tone: "green", label: t.reports.tiles.completed, value: String(tiles.completed), change: delta(tiles.completed, previous.completed), better: "up" },
    { key: "ontime", icon: "send", tone: "violet", label: t.reports.tiles.onTimeRate, value: tiles.onTimeRate === null ? "—" : `${tiles.onTimeRate}%`,
      change: tiles.onTimeRate === null || previous.onTimeRate === null ? null : tiles.onTimeRate - previous.onTimeRate, points: true, better: "up",
      note: tiles.onTimeRate === null ? t.reports.noRate : format(t.reports.onTimeDetail, { onTime: tiles.onTime, late: tiles.late }) },
    { key: "hours", icon: "clock", tone: "sky", label: t.reports.tiles.openHours, value: String(tiles.openHours), change: delta(tiles.openHours, previous.openHours), better: "down", note: t.reports.hoursUnit },
  ];
  const changeTone = (k: (typeof kpis)[number]) => !k.change || k.better === "none" ? "is-flat" : (k.change > 0) === (k.better === "up") ? "is-good" : "is-bad";

  return (
    <div className="viz-root rpt-page flex flex-col gap-5">
      <header className="rpt-hero">
        <span className="rpt-hero-icon" aria-hidden><Artwork name="reports" size={40} /></span>
        <div className="rpt-hero-text">
          <h1>{t.reports.title}</h1>
          <p>{t.reports.heroSubtitle}</p>
          <small>{t.reports.subtitle} · {format(t.reports.range, range)}</small>
        </div>
        <div className="rpt-hero-art" aria-hidden><Artwork name="reports" size={110} /></div>
        <div className="rpt-export">
          <span>{t.reports.exportReport}:</span>
          {(["csv", "xlsx", "pdf"] as const).map((f) => (
            <a key={f} href={`/api/export/report?format=${f}&${qs}`} className={`rpt-export-btn is-${f}`} download>
              <Icon name="download" size={15} />{f.toUpperCase()}
            </a>
          ))}
        </div>
      </header>

      <section className="rpt-period" aria-label={t.reports.periodTitle}>
        <span className="rpt-period-icon" aria-hidden><Artwork name="calendar" size={26} /></span>
        <div className="rpt-period-text"><strong>{t.reports.periodTitle}</strong><small>{t.reports.periodHint}</small></div>
        <nav className="rpt-presets" aria-label={t.reports.periodTitle}>
          {(["7d", "30d", "90d", "month"] as Period[]).map((p) => (
            <Link key={p} href={`/reports?period=${p}`} aria-current={period === p ? "page" : undefined} className={cn("rpt-preset", period === p && "is-active")}>
              {t.reports.periods[p]}
            </Link>
          ))}
        </nav>
        <form method="get" action="/reports" className="rpt-range">
          <input type="hidden" name="period" value="custom" />
          <Field label={t.reports.from} htmlFor="r-from"><Input id="r-from" name="from" type="date" defaultValue={range.from} /></Field>
          <Field label={t.reports.to} htmlFor="r-to"><Input id="r-to" name="to" type="date" defaultValue={range.to} /></Field>
          <SubmitButton variant="primary"><Icon name="search" size={16} />{t.reports.apply}</SubmitButton>
        </form>
      </section>

      <div className="rpt-kpis">
        {kpis.map((k) => (
          <div key={k.key} className={`rpt-kpi is-${k.tone}`}>
            <span className="rpt-kpi-icon" aria-hidden><Icon name={k.icon} size={20} /></span>
            <small>{k.label}</small>
            <strong>{k.value}</strong>
            <span className={`rpt-kpi-change ${changeTone(k)}`}>
              {k.change === null ? "—" : `${k.change > 0 ? "▲" : k.change < 0 ? "▼" : "–"} ${k.change > 0 ? "+" : ""}${k.change}${k.points ? "" : "%"}`}
              <em>{t.reports.vsPrevious}</em>
            </span>
            {k.note && <span className="rpt-kpi-note">{k.note}</span>}
            <span className="rpt-kpi-mark" aria-hidden><Icon name={k.icon} size={64} /></span>
          </div>
        ))}
      </div>

      <div className="rpt-charts">
        <TrendChart days={trend} locale={viewer.locale}
          labels={{ title: t.reports.trendTitle, subtitle: t.reports.trendSubtitle, created: t.reports.created, completed: t.reports.completedSeries, avg: t.reports.avg7, date: t.reports.date, table: t.reports.showTable, empty: t.reports.empty }} />
        <StatusDonut mix={mix}
          labels={{ title: t.reports.statusTitle, subtitle: t.reports.statusSubtitle, total: t.reports.total, unit: t.reports.tasksUnit, empty: t.reports.empty, ...t.reports.mix }} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title={t.reports.byStatus}
          unit={t.reports.tasksUnit}
          valueLabel={t.reports.tasksUnit}
          {...chartLabels}
          data={report.byStatus.map((s) => ({ key: s.status, label: t.status[s.status], value: s.count, href: `/tasks?status=${s.status}&archived=1` }))}
        />
        <BarList
          title={t.reports.byCategory}
          unit={t.reports.tasksUnit}
          valueLabel={t.reports.tasksUnit}
          {...chartLabels}
          data={report.byCategory.map((c) => ({
            key: c.categoryId ?? "none",
            label: c.categoryId ? (categoryName.get(c.categoryId) ?? "?") : t.reports.uncategorized,
            value: c.count,
            href: c.categoryId ? `/tasks?category=${c.categoryId}&archived=1` : undefined,
          }))}
        />
        <div className="lg:col-span-2">
          <BarList
            title={t.reports.hoursByPerson}
            unit={t.reports.hoursUnit}
            valueLabel={t.reports.hoursUnit}
            {...chartLabels}
            data={[...report.byPerson]
              .sort((a, b) => b.openHours - a.openHours)
              .map((p) => ({ key: p.userId, label: p.name, value: p.openHours, href: `/tasks?assignee=${p.userId}` }))}
          />
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 pb-2 text-lg font-semibold">{t.reports.byPerson}</h2>
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">{t.reports.person}</th>
              {(["open", "inReview", "overdue", "completed", "onTime", "late", "openHours"] as const).map((k) => (
                <th key={k} scope="col">
                  {t.reports.cols[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.byPerson.map((p) => (
              <tr key={p.userId}>
                <th scope="row" className="is-name font-normal">
                  {p.name}
                </th>
                <td>{p.open}</td>
                <td>{p.inReview}</td>
                <td>{p.overdue}</td>
                <td>{p.completed}</td>
                <td>{p.onTime}</td>
                <td>{p.late}</td>
                <td>{p.openHours}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs text-muted">{t.reports.scopeNote}</p>
      </Card>

      {isAdmin ? (
        <Card className="overflow-x-auto p-0">
          <div className="px-5 pt-5 pb-2">
            <h2 className="text-lg font-semibold">{t.reports.ranking}</h2>
            <p className="text-xs text-muted">{t.reports.rankingNote}</p>
          </div>
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">{t.reports.rank}</th>
                <th scope="col" className="is-name">
                  {t.reports.person}
                </th>
                <th scope="col">{t.reports.cols.onTime}</th>
                <th scope="col">{t.reports.cols.completed}</th>
                <th scope="col">{t.reports.cols.late}</th>
                <th scope="col">{t.reports.cols.overdue}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((p) => (
                <tr key={p.userId}>
                  <td className="!text-left">{p.rank}</td>
                  <td className="is-name">{p.name}</td>
                  <td>{p.onTime}</td>
                  <td>{p.completed}</td>
                  <td>{p.late}</td>
                  <td>{p.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      <p className="text-xs text-muted">{t.reports.exportAudited}</p>
    </div>
  );
}
