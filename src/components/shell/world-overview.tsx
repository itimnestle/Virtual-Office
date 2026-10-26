"use client";

import { Icon } from "@/components/icon";
import { Artwork } from "@/components/artwork";
import type { ArtworkName } from "@/lib/office/artwork";
import type { OfficeState } from "@/lib/office/state";
import type { Filter, Locale } from "@/components/office/office-view";
import { officeCopy } from "@/components/office/office-copy";

/** Greeting by Bangkok time of the snapshot, so server and client render the same text. */
export function greeting(at: string, locale: Locale) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", hourCycle: "h23" }).format(new Date(at)));
  const part = hour < 12 ? 0 : hour < 17 ? 1 : 2;
  return { text: (locale === "th" ? ["สวัสดีตอนเช้า", "สวัสดีตอนบ่าย", "สวัสดีตอนเย็น"] : ["Good morning", "Good afternoon", "Good evening"])[part], art: (["sun", "cloudSun", "moon"] as ArtworkName[])[part] };
}

export function WorldOverview({ state, locale, name, onFilter }: { state: OfficeState; locale: Locale; name: string; onFilter: (filter: Filter) => void }) {
  const hello = greeting(state.generatedAt, locale);
  const c = officeCopy[locale];
  const meeting = state.people.filter(p => p.location === "meeting").length;
  const away = state.people.filter(p => p.location === "home" || p.location === "offsite").length;
  const office = state.people.length - meeting - away;
  const updated = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(state.generatedAt));
  return <section className="world-overview" aria-label={locale === "th" ? "ภาพรวมพื้นที่ทำงาน" : "Workspace overview"}>
    <div className="world-overview-eyebrow"><span />{c.floor}<span className="world-floor-number">01</span></div>
    <h2><span className="world-overview-wave"><Artwork name={hello.art} size={32} /></span>{hello.text}<br /><strong>{name}</strong></h2>
    <p className="world-overview-description">{locale === "th" ? "ทุกไอเดีย เริ่มต้นจากการอยู่ใกล้กัน" : "Good things happen when we come together."}</p>
    <div className="world-overview-counts">{([
      ["office", "office", office, c.office], ["meeting", "meetings", meeting, c.meeting], ["away", "car", away, locale === "th" ? "นอกออฟฟิศ" : "Away"],
    ] as const).map(([filter, icon, count, label]) => <button type="button" key={filter} onClick={() => onFilter(filter)} aria-label={`${label} ${count} ${c.people}`}><span className={`world-count-icon is-${filter}`}><Artwork name={icon} size={23} /></span><strong>{count}</strong><small>{label}</small></button>)}</div>
    <div className="world-overview-foot"><span><Icon name="clock" size={12} />{c.updated} {updated} ICT</span><button type="button" onClick={() => onFilter("all")}>{c.team}<Icon name="arrow" size={13} /></button></div>
  </section>;
}

export function WorldLegend({ locale }: { locale: Locale }) {
  const c = officeCopy[locale];
  return <div className="world-workload-legend" aria-label={c.legend}><strong>{c.legend}</strong>{(["idle", "light", "busy", "heavy"] as const).map(level => <span key={level}><i className={`is-${level}`} />{c[level]}</span>)}</div>;
}
