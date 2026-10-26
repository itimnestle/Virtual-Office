"use client";

import { useId, useState } from "react";
import type { StatusMix } from "@/lib/reports";
import { Icon } from "@/components/icon";

/**
 * Status share as a donut with a 2px surface gap between segments. Segment
 * order keeps green away from red (colour-vision safe neighbours); the legend
 * doubles as the table, with counts and percentages in text ink.
 */
const ORDER: StatusMix[number]["key"][] = ["open", "overdue", "inReview", "completed"];
export const MIX_COLORS: Record<StatusMix[number]["key"], string> = { open: "#4c9be8", overdue: "#d9475a", inReview: "#c98510", completed: "#2f9a78" };

export function StatusDonut({ mix, labels }: {
  mix: StatusMix;
  labels: { title: string; subtitle: string; total: string; unit: string; empty: string } & Record<StatusMix[number]["key"], string>;
}) {
  const [active, setActive] = useState<string | null>(null);
  const id = useId();
  const items = ORDER.map((key) => ({ key, count: mix.find((m) => m.key === key)?.count ?? 0 }));
  const total = items.reduce((s, i) => s + i.count, 0);
  const R = 70, STROKE = 22, C = 2 * Math.PI * R, GAP = total ? 2 : 0;
  let offset = 0;

  return <section className="rpt-card rpt-donut" aria-labelledby={`${id}-t`}>
    <header className="rpt-card-head">
      <span className="rpt-card-icon is-violet" aria-hidden><Icon name="layers" size={20} /></span>
      <div><h2 id={`${id}-t`}>{labels.title}</h2><p>{labels.subtitle}</p></div>
    </header>
    <div className="rpt-donut-body">
      <svg viewBox="0 0 180 180" className="rpt-donut-svg" role="img" aria-label={`${labels.title}: ${items.map((i) => `${labels[i.key]} ${i.count}`).join(", ")}`}>
        <circle cx={90} cy={90} r={R} fill="none" stroke="var(--g-slot, #f3f1f8)" strokeWidth={STROKE} />
        {total > 0 && items.map((i) => {
          const len = (i.count / total) * C;
          const seg = <circle key={i.key} cx={90} cy={90} r={R} fill="none" stroke={MIX_COLORS[i.key]} strokeWidth={active === i.key ? STROKE + 6 : STROKE}
            strokeDasharray={`${Math.max(0, len - GAP)} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)"
            opacity={active && active !== i.key ? 0.35 : 1} className="rpt-donut-seg" />;
          offset += len;
          return i.count ? seg : null;
        })}
        <text x={90} y={80} textAnchor="middle" className="rpt-donut-k">{labels.total}</text>
        <text x={90} y={108} textAnchor="middle" className="rpt-donut-v">{total}</text>
        <text x={90} y={126} textAnchor="middle" className="rpt-donut-k">{labels.unit}</text>
      </svg>
      <ul className="rpt-donut-legend">
        {items.map((i) => <li key={i.key} onMouseEnter={() => setActive(i.key)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i.key)} onBlur={() => setActive(null)} tabIndex={0}>
          <i style={{ background: MIX_COLORS[i.key] }} />
          <span>{labels[i.key]}</span>
          <b>{i.count}</b>
          <em>{total ? Math.round((i.count / total) * 100) : 0}%</em>
        </li>)}
      </ul>
    </div>
    {total === 0 && <p className="rpt-empty">{labels.empty}</p>}
  </section>;
}
