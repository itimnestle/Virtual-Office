"use client";

import Link from "next/link";
import { Component, type ReactNode } from "react";
import { Badge, cn } from "@/components/ui";
import { Icon, type IconName } from "@/components/icon";
import { Artwork } from "@/components/artwork";
import type { OfficePerson } from "@/lib/office/state";
import { workloadLevel } from "@/lib/office/state";
import { formatBangkok } from "@/lib/time";
import { officeCopy } from "./office-copy";
import { PersonPortrait } from "./person-portrait";

/** Building blocks of the 3D office shell (see components/shell/world-shell.tsx). */

export type OfficeLabels = {
  hint: string; placeholder: string; view2d: string; view3d: string; fallback: string; unassignedBoard: string;
  locations: Record<OfficePerson["location"], string>; absence: Record<"full_day" | "am" | "pm", string>;
  roles: Record<string, string>; status: Record<string, string>;
  open: string; hours: string; urgent: string; inReview: string; nextDue: string; noTasks: string; close: string; pet: string;
};
export type Locale = "th" | "en";
export type Filter = "all" | "office" | "meeting" | "away";

export function SceneLoading({ text = "3D OFFICE" }: { text?: string }) {
  return <div className="scene-loading" role="status"><span className="scene-loading-mark"><Icon name="office" size={32} /></span><p>{text}</p><span className="scene-loading-bar" /></div>;
}

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const supported = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return supported;
  } catch { return false; }
}

export class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function ToolButton({ icon, label, onClick, active, disabled }: { icon: IconName; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return <button type="button" className={cn("office-tool", active && "is-active")} aria-label={label} title={label} aria-pressed={active} onClick={onClick} disabled={disabled}><Icon name={icon} size={18} /></button>;
}

export function PersonPanel({ person, labels, locale, onClose }: { person: OfficePerson; labels: OfficeLabels; locale: Locale; onClose: () => void }) {
  const c = officeCopy[locale];
  return <section className="person-detail" aria-label={`${c.profile}: ${person.name}`}>
    <button type="button" onClick={onClose} className="person-back"><Icon name="arrow" size={16} className="rotate-180" />{c.back}</button>
    <div className="person-detail-header"><PersonPortrait person={person} large /><h3>{person.nickname ?? person.name}</h3><p>{person.name}</p><span>{person.jobTitle ?? labels.roles[person.role]}</span></div>
    <div className="flex flex-wrap justify-center gap-2">
      <Badge tone={person.location === "home" ? "warning" : "primary"}>{person.location === "home" && person.absence ? labels.absence[person.absence.part] : labels.locations[person.location]}</Badge>
      {person.meetingTitle && <Badge>{person.meetingTitle}</Badge>}
      {person.pet && <Badge><Artwork name={person.pet.species} size={19} /> {person.pet.name}</Badge>}
      {person.status?.note && <Badge tone="accent">{person.status.note}</Badge>}
    </div>
    <h4 className="office-section-label">{c.workload}</h4>
    <dl className="person-metrics">{[[labels.open, person.workload.open], [labels.hours, person.workload.estimatedHours], [labels.urgent, person.workload.urgent], [labels.inReview, person.workload.inReview]].map(([k, v]) => <div key={String(k)}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {person.nextDue && <Link href={`/tasks/${person.nextDue.id}`} className="person-next-due"><span><Icon name="clock" size={15} />{labels.nextDue}</span><strong>{person.nextDue.title}</strong><small>{formatBangkok(person.nextDue.dueAt, locale)}</small></Link>}
    <h4 className="office-section-label">{c.work}<span>{person.tasks.length}</span></h4>
    {person.tasks.length ? <ul className="person-task-list" data-testid="office-person-tasks">{person.tasks.map(task => <li key={task.id}><Link href={`/tasks/${task.id}`}><span className={cn("task-marker", task.isUrgent && "is-urgent")} /><span className="min-w-0 flex-1"><strong>{task.title}</strong><small>{labels.status[task.status]}</small></span><Icon name="chevron" size={14} /></Link></li>)}</ul> : <div className="office-empty"><Icon name="check" size={24} /><p>{labels.noTasks}</p></div>}
  </section>;
}

export function OfficeGrid({ people, labels, onSelect, selectedId, empty }: { people: OfficePerson[]; labels: OfficeLabels; onSelect: (id: string) => void; selectedId: string | null; empty: string }) {
  const order: OfficePerson["location"][] = ["director_room", "manager_desk", "desk", "meeting", "lounge", "offsite", "home"];
  return <div className="office-directory">{!people.length && <div className="office-empty"><Icon name="people" size={28} /><p>{empty}</p></div>}{order.map(loc => {
    const group = people.filter(p => p.location === loc);
    if (!group.length) return null;
    return <section key={loc}><h3>{labels.locations[loc]}<span>{group.length}</span></h3><div>{group.map(p => <button key={p.id} type="button" className={cn("directory-person", selectedId === p.id && "is-selected")} aria-pressed={selectedId === p.id} onClick={() => onSelect(p.id)}><PersonPortrait person={p} /><span><strong>{p.nickname ?? p.name}</strong><small>{p.jobTitle ?? labels.roles[p.role]}</small></span><span className={`workload-pill is-${workloadLevel(p.workload.open)}`}>{p.workload.open}</span><Icon name="chevron" size={15} /></button>)}</div></section>;
  })}</div>;
}
