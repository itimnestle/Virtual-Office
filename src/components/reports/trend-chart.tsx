"use client";

import { useId, useState } from "react";
import type { TrendDay } from "@/lib/reports";
import { Icon } from "@/components/icon";

/**
 * Daily activity: created and completed as paired thin bars, and the 7-day
 * average of completions as a line (same unit and scale as the bars). One y-axis (all three are task counts). Hover / focus a day for
 * a tooltip; a table view lists every day.
 */
export const TREND_COLORS = { created: "#7b6ee6", completed: "#2f9a78", avg: "#c98510" } as const;

export function TrendChart({ days, locale, labels }: {
  days: TrendDay[]; locale: "th" | "en";
  labels: { title: string; subtitle: string; created: string; completed: string; avg: string; date: string; table: string; empty: string };
}) {
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const W = 720, H = 240, L = 34, R = 10, T = 12, B = 26;
  const plotW = W - L - R, plotH = H - T - B;
  const max = Math.max(1, ...days.flatMap((d) => [d.created, d.completed, d.completedAvg]));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => T + plotH - (v / top) * plotH;
  const col = plotW / Math.max(1, days.length);
  const barW = Math.max(2, Math.min(12, (col - 4) / 2));
  const fmt = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const longFmt = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const label = (d: string) => fmt.format(new Date(`${d}T00:00:00Z`));
  const every = Math.max(1, Math.ceil(days.length / 8));
  const linePath = days.map((d, i) => `${i ? "L" : "M"}${(L + col * i + col / 2).toFixed(1)},${y(d.completedAvg).toFixed(1)}`).join(" ");
  const total = days.reduce((s, d) => s + d.created + d.completed, 0);
  const a = active === null ? null : days[active];

  return <section className="rpt-card rpt-trend" aria-labelledby={`${id}-t`}>
    <header className="rpt-card-head">
      <span className="rpt-card-icon is-violet" aria-hidden><Icon name="chart" size={20} /></span>
      <div><h2 id={`${id}-t`}>{labels.title}</h2><p>{labels.subtitle}</p></div>
      <ul className="rpt-legend">
        <li><i style={{ background: TREND_COLORS.created }} />{labels.created}</li>
        <li><i style={{ background: TREND_COLORS.completed }} />{labels.completed}</li>
        <li><i className="is-line" style={{ background: TREND_COLORS.avg }} />{labels.avg}</li>
      </ul>
    </header>
    {total === 0 ? <p className="rpt-empty">{labels.empty}</p> : <div className="rpt-plot" onMouseLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.title} preserveAspectRatio="none">
        {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((v) => <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="rpt-grid" />
          <text x={L - 8} y={y(v) + 4} className="rpt-axis" textAnchor="end">{v}</text>
        </g>)}
        {active !== null && <rect x={L + col * active} y={T} width={col} height={plotH} className="rpt-hover-band" />}
        {days.map((d, i) => {
          const x0 = L + col * i + col / 2;
          return <g key={d.date}>
            {d.created > 0 && <path d={bar(x0 - barW - 1, y(d.created), barW, y(0) - y(d.created))} fill={TREND_COLORS.created} />}
            {d.completed > 0 && <path d={bar(x0 + 1, y(d.completed), barW, y(0) - y(d.completed))} fill={TREND_COLORS.completed} />}
            {i % every === 0 && <text x={x0} y={H - 6} className="rpt-axis" textAnchor="middle">{label(d.date)}</text>}
          </g>;
        })}
        <path d={linePath} fill="none" stroke={TREND_COLORS.avg} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {a && <circle cx={L + col * active! + col / 2} cy={y(a.completedAvg)} r={5} fill={TREND_COLORS.avg} stroke="var(--surface)" strokeWidth={2} />}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="rpt-baseline" />
        {/* Hit targets wider than the marks: one per day. */}
        {days.map((d, i) => <rect key={d.date} x={L + col * i} y={T} width={col} height={plotH} fill="transparent" tabIndex={0}
          aria-label={`${longFmt.format(new Date(`${d.date}T00:00:00Z`))}: ${labels.created} ${d.created}, ${labels.completed} ${d.completed}, ${labels.avg} ${d.completedAvg}`}
          onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} />)}
      </svg>
      {a && <div className="rpt-tooltip" style={{ left: `${((L + col * active! + col / 2) / W) * 100}%` }} role="status">
        <strong>{longFmt.format(new Date(`${a.date}T00:00:00Z`))}</strong>
        <span><i style={{ background: TREND_COLORS.created }} />{labels.created}<b>{a.created}</b></span>
        <span><i style={{ background: TREND_COLORS.completed }} />{labels.completed}<b>{a.completed}</b></span>
        <span><i className="is-line" style={{ background: TREND_COLORS.avg }} />{labels.avg}<b>{a.completedAvg}</b></span>
      </div>}
    </div>}
    <details className="rpt-table">
      <summary>{labels.table}</summary>
      <div className="overflow-x-auto"><table>
        <thead><tr><th scope="col">{labels.date}</th><th scope="col">{labels.created}</th><th scope="col">{labels.completed}</th><th scope="col">{labels.avg}</th></tr></thead>
        <tbody>{days.map((d) => <tr key={d.date}><th scope="row">{label(d.date)}</th><td>{d.created}</td><td>{d.completed}</td><td>{d.completedAvg}</td></tr>)}</tbody>
      </table></div>
    </details>
  </section>;
}

/** Bar with a 4px rounded data end and a square baseline. */
function bar(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceStep(max: number) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow);
}
