"use client";

import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import { Artwork } from "@/components/artwork";
import { Icon } from "@/components/icon";
import { PersonPortrait } from "@/components/office/person-portrait";
import { officeCopy } from "@/components/office/office-copy";
import type { Locale, OfficeLabels } from "@/components/office/office-view";
import type { ArtworkName } from "@/lib/office/artwork";
import { SPOT_ART, SPOT_COLOR, colorForNavKey, spotForNavKey, type SpotKey } from "@/lib/office/destinations";
import { DESKS, DIRECTOR_DESK, MANAGER_DESK, SPOTS, deskFor, deskOf, placePeople, roomDepth, type Vec3 } from "@/lib/office/layout";
import type { OfficePerson, OfficeState } from "@/lib/office/state";
import { workloadLevel } from "@/lib/office/state";
import type { NavKey } from "@/lib/rbac";
import { greeting } from "./world-overview";

/**
 * Game-style heads-up display over the 3D office: the player card (who you
 * are), a hotbar of places with number keys, and a minimap of the floor.
 * Everything here is plain DOM so it stays crisp, keyboard reachable and
 * readable by screen readers; the scene itself is the 3D canvas behind it.
 */

export type HotbarSlot = { key: NavKey; href: string; label: string; badge?: number };

function artFor(key: NavKey): ArtworkName {
  const spot = spotForNavKey(key);
  return spot ? SPOT_ART[spot] : "settings";
}

function placeVars(key: NavKey): CSSProperties {
  const c = colorForNavKey(key);
  return { "--place": c.main, "--place-soft": c.soft, "--place-ink": c.ink } as CSSProperties;
}

export function PlayerCard({ person, name, roleLabel, generatedAt, locale, labels, href }: {
  person: OfficePerson | undefined; name: string; roleLabel: string; generatedAt: string; locale: Locale; labels: OfficeLabels; href: string | null;
}) {
  const hello = greeting(generatedAt, locale);
  const place = person ? (person.location === "home" && person.absence ? labels.absence[person.absence.part] : labels.locations[person.location]) : roleLabel;
  const body = <>
    <span className="hud-player-portrait">
      {person ? <PersonPortrait person={person} /> : <span className="hud-player-initial" aria-hidden>{Array.from(name)[0]}</span>}
    </span>
    <span className="hud-player-text">
      <small><Artwork name={hello.art} size={14} />{hello.text}</small>
      <strong>{name}</strong>
      <span className="hud-player-meta"><em>{roleLabel}</em>{person && <span className={`hud-player-place is-${person.location}`}>{place}</span>}</span>
    </span>
  </>;
  return href
    ? <Link href={href} className="hud-player" aria-label={`${name} · ${roleLabel}`}>{body}</Link>
    : <div className="hud-player">{body}</div>;
}

export function Hotbar({ slots, activeKey, locale }: { slots: HotbarSlot[]; activeKey: NavKey | null; locale: Locale }) {
  const c = officeCopy[locale];
  return <nav className="hud-hotbar" aria-label={c.hotbar}>
    <ol>{slots.map((slot, i) => <li key={slot.key}>
      <Link href={slot.href} className="hud-slot" style={placeVars(slot.key)} aria-current={slot.key === activeKey ? "page" : undefined}
        aria-keyshortcuts={String(i + 1)} title={`${slot.label} (${i + 1})`}>
        <span className="hud-slot-key" aria-hidden>{i + 1}</span>
        <span className="hud-slot-art"><Artwork name={artFor(slot.key)} size={26} /></span>
        <span className="hud-slot-label">{slot.label}</span>
        {slot.badge ? <span className="hud-slot-badge">{slot.badge > 99 ? "99+" : slot.badge}</span> : null}
      </Link>
    </li>)}</ol>
  </nav>;
}

/** Room outline and zones, in scene units (x, z, width, depth, colour). */
const ZONES: [number, number, number, number, string][] = [
  [-13.4, -10, 8.4, 7.2, "#d9ccf5"], // director's office
  [4.2, -10, 9.2, 7.2, "#cfe5fb"], // meeting room
  [-12.3, 1.5, 6.9, 6, "#fde3cf"], // lounge
  [6.7, 2.4, 5.6, 5.8, "#d8f0d8"], // on leave
];

export function Minimap({ state, viewerId, selectedId, spots, focusSpot, locale, labels, open, onToggle, onSelectPerson, onOpenSpot }: {
  state: OfficeState; viewerId: string | null; selectedId: string | null; spots: { key: SpotKey; label: string }[]; focusSpot: SpotKey | null;
  locale: Locale; labels: OfficeLabels; open: boolean; onToggle: () => void;
  onSelectPerson: (id: string) => void; onOpenSpot: (spot: SpotKey) => void;
}) {
  const c = officeCopy[locale];
  const placed = useMemo(() => placePeople(state.people), [state.people]);
  const members = state.people.filter((p) => p.role === "member");
  const depth = roomDepth(members.length);
  const viewerDesk = deskOf(state.people.find((p) => p.id === viewerId));
  // Scene x −14…14 and z −10.5…depth−9.5 map onto the map's width and height.
  const W = 28, H = depth + 1, X0 = -14, Z0 = -10.5;
  const pct = (at: Vec3): CSSProperties => ({ left: `${((at[0] - X0) / W) * 100}%`, top: `${((at[2] - Z0) / H) * 100}%` });
  const meeting = state.people.filter((p) => p.location === "meeting").length;
  const away = state.people.filter((p) => p.location === "home" || p.location === "offsite").length;
  const office = state.people.length - meeting - away;
  const desks: Vec3[] = [DIRECTOR_DESK, MANAGER_DESK, ...Array.from({ length: Math.max(DESKS.length, members.length) }, (_, i) => deskFor(i))];

  return <section className={`hud-minimap${open ? "" : " is-collapsed"}`} aria-label={c.minimap}>
    <header>
      <strong>{c.minimap}</strong>
      <span className="hud-minimap-counts" aria-label={`${c.office} ${office} · ${c.meeting} ${meeting} · ${c.away} ${away}`}>
        <span className="is-office">{office}</span><span className="is-meeting">{meeting}</span><span className="is-away">{away}</span>
      </span>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-label={open ? c.hideMap : c.showMap} title={`${open ? c.hideMap : c.showMap} (M)`} aria-keyshortcuts="M">
        <Icon name={open ? "minus" : "plus"} size={14} />
      </button>
    </header>
    {open && <>
      <div className="hud-minimap-floor" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`${X0} ${Z0} ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          <rect x={-13.6} y={-10} width={27.2} height={depth} rx={0.8} className="hud-minimap-room" />
          {ZONES.map(([x, z, w, d, fill], i) => <rect key={i} x={x} y={z} width={w} height={d} rx={0.5} fill={fill} opacity={0.75} />)}
          {desks.map((d, i) => <rect key={i} x={d[0] - 1.05} y={d[2] - 0.55} width={2.1} height={1.1} rx={0.2} className="hud-minimap-desk" />)}
          {viewerDesk && <rect x={viewerDesk[0] - 1.25} y={viewerDesk[2] - 0.75} width={2.5} height={1.5} rx={0.35} fill="none" stroke={SPOT_COLOR.desk.main} strokeWidth={0.22} />}
        </svg>
        {spots.map(({ key: spot, label }) => {
          const at = spot === "desk" ? viewerDesk : SPOTS[spot].at;
          if (!at) return null;
          return <button key={spot} type="button" className={`hud-minimap-pin${focusSpot === spot ? " is-active" : ""}`} style={{ ...pct(at), background: SPOT_COLOR[spot].soft, borderColor: SPOT_COLOR[spot].main }}
            onClick={() => onOpenSpot(spot)} aria-label={`${c.openPlace} ${label}`} title={label} data-spot={spot}>
            <Artwork name={SPOT_ART[spot]} size={12} />
          </button>;
        })}
        {placed.map(({ person, position }) => <button key={person.id} type="button" style={pct(position)}
          className={`hud-minimap-person is-${workloadLevel(person.workload.open)}${person.id === viewerId ? " is-you" : ""}${person.id === selectedId ? " is-selected" : ""}`}
          onClick={() => onSelectPerson(person.id)} aria-label={`${person.nickname ?? person.name} · ${labels.locations[person.location]}${person.id === viewerId ? ` · ${c.you}` : ""}`}
          title={person.nickname ?? person.name} />)}
      </div>
      <footer className="hud-minimap-legend">{(["idle", "light", "busy", "heavy"] as const).map((level) => <span key={level}><i className={`is-${level}`} />{c[level]}</span>)}</footer>
    </>}
  </section>;
}
