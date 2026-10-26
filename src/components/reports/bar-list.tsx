"use client";

import { useId, useState } from "react";

export type BarDatum = { key: string; label: string; value: number; href?: string };

/**
 * Single-series horizontal bar chart (one hue, so no legend box — the title
 * names the series). Thin bars with a rounded data end, the value at the tip in
 * text ink, a whole-row hover/focus target with a tooltip, and a table view so
 * nothing depends on hovering or on color.
 */
export function BarList({
  title,
  data,
  unit,
  tableLabel,
  emptyLabel,
  valueLabel,
}: {
  title: string;
  data: BarDatum[];
  unit: string;
  tableLabel: string;
  emptyLabel: string;
  valueLabel: string;
}) {
  const id = useId();
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  const hasData = data.some((d) => d.value > 0);

  return (
    <figure className="viz-card" aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="viz-title">
        {title}
      </figcaption>
      {!hasData ? (
        <p className="viz-empty">{emptyLabel}</p>
      ) : (
        <ul className="viz-bars" role="list">
          {data.map((d) => {
            const pct = (d.value / max) * 100;
            const tip = `${fmt(d.value)} ${unit}`;
            const row = (
              <>
                <span className="viz-bar-label">{d.label}</span>
                <span className="viz-bar-track">
                  {d.value > 0 ? <span className="viz-bar" style={{ width: `${Math.max(pct, 1.5)}%` }} /> : null}
                  <span className="viz-bar-value">{fmt(d.value)}</span>
                </span>
                {active === d.key ? (
                  <span role="tooltip" className="viz-tooltip">
                    <strong>{tip}</strong>
                    <span>{d.label}</span>
                  </span>
                ) : null}
              </>
            );
            const common = {
              className: "viz-bar-row",
              onPointerEnter: () => setActive(d.key),
              onPointerLeave: () => setActive(null),
              onFocus: () => setActive(d.key),
              onBlur: () => setActive(null),
              "aria-label": `${d.label}: ${tip}`,
            };
            return (
              <li key={d.key}>
                {d.href ? (
                  <a href={d.href} {...common}>
                    {row}
                  </a>
                ) : (
                  <div tabIndex={0} {...common}>
                    {row}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <details className="viz-table">
        <summary>{tableLabel}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{title}</th>
              <th scope="col">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.label}</th>
                <td>{fmt(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
