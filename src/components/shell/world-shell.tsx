"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { Icon, type IconName } from "@/components/icon";
import { Artwork } from "@/components/artwork";
import type { ArtworkName } from "@/lib/office/artwork";
import { useChat } from "@/components/chat/chat-provider";
import { officeCopy } from "@/components/office/office-copy";
import { OfficeGrid, PersonPanel, SceneBoundary, SceneLoading, ToolButton, hasWebGL, type Filter, type Locale, type OfficeLabels } from "@/components/office/office-view";
import { PersonPortrait } from "@/components/office/person-portrait";
import type { CameraCommand, SceneQuality, ViewInset } from "@/components/office/office-scene";
import type { SceneHotspot } from "@/components/office/office-hotspots";
import { ROUTE_GROUPS, SPOT_ART, SPOT_ROUTE, colorForNavKey, navKeyForPath, spotForNavKey, type SpotKey } from "@/lib/office/destinations";
import type { OfficePerson, OfficeState } from "@/lib/office/state";
import { workloadLevel } from "@/lib/office/state";
import type { NavKey } from "@/lib/rbac";
import { Hotbar, Minimap, PlayerCard } from "./world-hud";

const OfficeScene = dynamic(() => import("@/components/office/office-scene"), { ssr: false, loading: () => <SceneLoading /> });

function subscribeMotion(listener: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const motionSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverMotionSnapshot = () => true;

/** Each place carries its colour into the HUD as CSS variables. */
function placeStyle(key: NavKey | null): CSSProperties {
  const color = colorForNavKey(key);
  return { "--place": color.main, "--place-soft": color.soft, "--place-ink": color.ink } as CSSProperties;
}

export type ShellNavItem = { key: NavKey; href: string; label: string; badge?: number };

const NAV_ICON: Partial<Record<NavKey, IconName>> = {
  dashboard: "home", tasks: "tasks", inbox: "inbox", meetings: "meeting", calendar: "calendar", reports: "chart",
  notifications: "bell", me: "user", settings: "settings", adminUsers: "people", adminConfig: "layers", health: "shield",
};

/**
 * The whole signed-in app is one 3D office. Pages are opened from objects in
 * the room and appear as a window over it; the scene stays mounted between
 * pages. A 2D lobby (no WebGL, or by choice) offers the same places as a list.
 */
export function WorldShell({ nav, state, labels, locale, canAssign, viewer, children }: {
  nav: ShellNavItem[]; state: OfficeState; labels: OfficeLabels; locale: Locale; canAssign: boolean;
  viewer: { name: string; roleLabel: string; signOut: string; appName: string };
  children: ReactNode;
}) {
  const c = officeCopy[locale];
  const pathname = usePathname();
  const router = useRouter();
  const chat = useChat();
  const systemReduceMotion = useSyncExternalStore(subscribeMotion, motionSnapshot, serverMotionSnapshot);
  const reduceMotion = Boolean(chat?.prefs.reduceMotion || systemReduceMotion);

  const navKey = navKeyForPath(pathname, nav);
  const current = nav.find((n) => n.key === navKey) ?? null;
  const focusSpot = spotForNavKey(navKey);
  const windowOpen = navKey !== null;
  // Hotbar: one slot per place (admin pages share one), numbered 1–9.
  const hotbar = nav.filter((n) => n.key !== "office" && n.key !== "adminConfig" && n.key !== "health").slice(0, 9)
    .map((n) => ({ key: n.key, href: n.href, label: n.key === "dashboard" ? c.myDesk : n.label, badge: n.key === "inbox" ? state.unassignedCount || undefined : n.badge }));

  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [quality, setQuality] = useState<SceneQuality>("high");
  const [mapOpen, setMapOpen] = useState(true);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [menuOpen, setMenuOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [help, setHelp] = useState(false);
  // Data-heavy pages open wide; the widen button still overrides.
  const [wideChoice, setWide] = useState<boolean | null>(null);
  const wide = wideChoice ?? (navKey === "reports" || navKey === "tasks");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [evening, setEvening] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [command, setCommand] = useState<CameraCommand>({ view: "overview", zoom: 1, revision: 0 });
  const [inset, setInset] = useState<ViewInset>({ right: 0, bottom: 0 });
  const windowRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const teamRef = useRef<HTMLElement>(null);
  const lastSelected = useRef<string | null>(null);

  // Browser-only capability detection keeps the server markup deterministic.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebgl(hasWebGL());
    // Phones and touch tablets start on the lighter look; a saved choice wins.
    let saved: string | null = null;
    try { saved = window.localStorage.getItem("vo.quality"); } catch { /* storage may be blocked */ }
    setQuality(saved === "high" || saved === "low" ? saved : window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768 ? "low" : "high");
    setMapOpen(window.innerWidth >= 768);
  }, []);
  const toggleQuality = () => {
    const next = quality === "high" ? "low" : "high";
    setQuality(next);
    try { window.localStorage.setItem("vo.quality", next); } catch { /* per-browser convenience only */ }
  };

  // A new page starts at its top and is announced by moving focus to its title.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    if (windowOpen) titleRef.current?.focus({ preventScroll: true });
  }, [pathname, windowOpen]);

  // The camera centres the room in the part of the screen the window leaves free.
  useEffect(() => {
    const el = windowOpen ? windowRef.current : selectedId ? teamRef.current : null;
    if (!el) { setInset({ right: 0, bottom: 0 }); return; }
    const measure = () => {
      const r = el.getBoundingClientRect();
      const mobile = window.innerWidth < 768;
      setInset(mobile ? { right: 0, bottom: Math.max(0, window.innerHeight - r.top) } : windowOpen ? { right: Math.max(0, window.innerWidth - r.left), bottom: 0 } : { left: Math.max(0, r.right), right: 0, bottom: 0 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [windowOpen, wide, selectedId]);

  useEffect(() => {
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") {
        if (menuOpen) { setMenuOpen(false); menuButton.current?.focus(); return; }
        if (help) { setHelp(false); return; }
        if (selectedId) { setSelectedId(null); setTeamOpen(true); return; }
        if (teamOpen) { setTeamOpen(false); return; }
        // Leaving a form field with Esc should not close the page under it.
        if (windowOpen && !typing(event.target) && !document.querySelector("dialog[open], [aria-modal='true']")) router.push("/office");
        return;
      }
      if (typing(event.target) || menuOpen) return;
      if (/^[1-9]$/.test(event.key)) {
        const slot = hotbar[Number(event.key) - 1];
        if (slot) { event.preventDefault(); router.push(slot.href); }
      } else if (event.key === "m" || event.key === "M") setMapOpen((open) => !open);
      else if ((event.key === "t" || event.key === "T") && !windowOpen) { setSelectedId(null); setTeamOpen((open) => !open); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (selectedId) { lastSelected.current = selectedId; teamRef.current?.querySelector<HTMLButtonElement>(".person-back")?.focus(); }
    else if (teamOpen) {
      const previous = Array.from(teamRef.current?.querySelectorAll<HTMLButtonElement>("[data-person-id]") ?? []).find(button => button.dataset.personId === lastSelected.current);
      (previous ?? teamRef.current?.querySelector<HTMLInputElement>("input"))?.focus();
    }
  }, [selectedId, teamOpen]);

  // Closing the menu by clicking elsewhere leaves scene interactions available.
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("#world-menu") && !menuButton.current?.contains(target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [menuOpen]);

  const hrefOf = (key: NavKey) => nav.find((n) => n.key === key)?.href;
  const hotspots: SceneHotspot[] = (Object.keys(SPOT_ROUTE) as SpotKey[]).flatMap((spot) => {
    const item = nav.find((n) => n.key === SPOT_ROUTE[spot]);
    if (!item) return [];
    const label = spot === "desk" ? c.myDesk : item.label;
    return [{ key: spot, label, badge: spot === "inbox" ? state.unassignedCount || undefined : item.badge, active: focusSpot === spot }];
  });
  const openSpot = (spot: SpotKey) => { const href = hrefOf(SPOT_ROUTE[spot]); if (href) router.push(href); };

  const show3d = webgl === true && mode === "3d";
  const isAway = (p: OfficePerson) => p.location === "home" || p.location === "offsite";
  const people = state.people.filter((p) => {
    const matches = filter === "all" || (filter === "office" && p.location !== "meeting" && !isAway(p)) || (filter === "meeting" && p.location === "meeting") || (filter === "away" && isAway(p));
    return matches && `${p.name} ${p.nickname ?? ""} ${p.jobTitle ?? ""} ${labels.roles[p.role]}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale));
  });
  const selected = state.people.find((p) => p.id === selectedId) ?? null;
  const setView = (view: CameraCommand["view"]) => { setSelectedId(null); if (windowOpen) router.push("/office"); setCommand((prev) => ({ view, zoom: 1, revision: prev.revision + 1 })); };
  const zoom = (delta: number) => setCommand((prev) => ({ ...prev, zoom: Math.min(2.2, Math.max(0.55, prev.zoom + delta)) }));
  const group = ROUTE_GROUPS.find((g) => navKey && g.includes(navKey));
  const tabs = group ? nav.filter((n) => group.includes(n.key)) : [];
  const artworkFor = (key: NavKey): ArtworkName => { const spot = spotForNavKey(key); return spot ? SPOT_ART[spot] : "settings"; };
  const notifications = nav.find((n) => n.key === "notifications");
  const hotbarKey = navKey === "adminConfig" || navKey === "health" ? "adminUsers" : navKey;
  const viewerPerson = state.people.find((p) => p.id === chat?.viewerId);
  const meHref = hrefOf("me") ?? null;

  /** 2D lobby: every place as a card plus the team directory. */
  const lobby = <div className="world-lobby">
      {webgl === false && <p role="status" className="office-fallback-note">{labels.fallback}</p>}
      <h2>{c.lobby}</h2>
      <ul className="world-lobby-places">{nav.filter((n) => n.key !== "office").map((n) => <li key={n.key}><Link href={n.href} style={placeStyle(n.key)}>
        <span className="world-lobby-art"><Artwork name={artworkFor(n.key)} size={32} /></span>
        <span>{n.key === "dashboard" ? c.myDesk : n.label}</span>{n.badge ? <span className="world-badge is-inline">{n.badge}</span> : null}
        <Icon name={NAV_ICON[n.key] ?? "chevron"} size={16} />
      </Link></li>)}</ul>
      <h2>{c.team}</h2>
      {selected ? <PersonPanel key={selected.id} person={selected} labels={labels} locale={locale} onClose={() => setSelectedId(null)} />
        : <OfficeGrid people={state.people} labels={labels} onSelect={setSelectedId} selectedId={selectedId} empty={c.noPeople} />}
      {canAssign && state.unassignedCount > 0 && <p className="world-lobby-note"><Icon name="inbox" size={15} />{labels.unassignedBoard}: {state.unassignedCount}</p>}
    </div>;

  return <div className={cn("world", windowOpen && "has-window", evening && "is-evening")}>
    <div className="world-stage">
      {webgl === null ? <SceneLoading text={c.loading} />
        : show3d ? <SceneBoundary fallback={lobby}>
          <OfficeScene state={state} selectedId={windowOpen ? null : selectedId} onSelect={setSelectedId} boardLabel={labels.unassignedBoard} command={command}
            evening={evening} showNames={showNames} locale={locale}
            viewerId={chat?.viewerId} petAlert={chat?.petAlert} soundEnabled={chat?.prefs.sound} reduceMotion={reduceMotion}
            emotes={chat?.emotes} onEmoteDone={chat?.dismissEmote}
            hotspots={hotspots} onOpenSpot={openSpot} focusSpot={focusSpot} inset={inset} quality={quality} />
        </SceneBoundary>
        : lobby}
    </div>

    <header className="world-hud">
      <PlayerCard person={viewerPerson} name={viewer.name} roleLabel={viewer.roleLabel} generatedAt={state.generatedAt} locale={locale} labels={labels} href={meHref} />
      {current && <span className="world-place" style={placeStyle(current.key)}><span className="world-place-art"><Artwork name={artworkFor(current.key)} size={26} /></span>{current.key === "dashboard" ? c.myDesk : current.label}</span>}
      <span className="world-hud-spacer" />
      {show3d && !windowOpen && <button type="button" className={cn("world-hud-button", teamOpen && "is-active")} aria-label={`${c.team} (T)`} title={`${c.team} (T)`} aria-pressed={teamOpen} onClick={() => { setSelectedId(null); setTeamOpen(!teamOpen); }}>
        <Icon name="search" size={19} />
      </button>}
      {notifications && <Link href={notifications.href} className="world-hud-button" aria-label={notifications.label} title={notifications.label}>
        <Artwork name="notifications" size={26} />{notifications.badge ? <span className="world-badge">{notifications.badge}</span> : null}
      </Link>}
      <button ref={menuButton} type="button" className={cn("world-hud-button is-menu", menuOpen && "is-active")} aria-label={menuOpen ? c.closeMenu : c.menu} aria-expanded={menuOpen} aria-controls="world-menu" onClick={() => setMenuOpen(!menuOpen)}>
        <Icon name={menuOpen ? "close" : "menu"} size={18} /><span>{menuOpen ? c.closeMenu : c.menu}</span>
      </button>
    </header>

    {show3d && !teamOpen && !selected && <Minimap state={state} viewerId={chat?.viewerId ?? null} selectedId={selectedId} spots={hotspots.map((h) => ({ key: h.key, label: h.label }))}
      focusSpot={focusSpot} locale={locale} labels={labels} open={mapOpen} onToggle={() => setMapOpen(!mapOpen)}
      onSelectPerson={(id) => { if (windowOpen) router.push("/office"); setSelectedId(id); }} onOpenSpot={openSpot} />}
    <Hotbar slots={hotbar} activeKey={hotbarKey} locale={locale} />

    {menuOpen && <nav id="world-menu" className="world-menu" aria-label={c.places}>
      <div className="world-menu-head">
        <div><h2>{c.menu}</h2><p>{c.menuSubtitle}</p></div>
        <button type="button" onClick={() => { setMenuOpen(false); menuButton.current?.focus(); }} aria-label={c.closeMenu}><Icon name="close" size={18} /></button>
      </div>
      <ul>
        <li><Link href="/office" onClick={() => setMenuOpen(false)} aria-current={!windowOpen ? "page" : undefined}><span className="world-menu-link-icon"><Artwork name="office" size={27} /></span><span className="world-menu-link-text">{c.backToOffice}</span><Icon name="chevron" size={16} className="world-menu-chevron" /></Link></li>
        {nav.filter((n) => n.key !== "office").map((n) => <li key={n.key}>
          <Link href={n.href} onClick={() => setMenuOpen(false)} aria-current={n.key === navKey ? "page" : undefined} style={placeStyle(n.key)}>
            <span className="world-menu-link-icon"><Artwork name={artworkFor(n.key)} size={27} /></span><span className="world-menu-link-text">{n.key === "dashboard" ? c.myDesk : n.label}</span>
            {(n.key === "inbox" ? state.unassignedCount || n.badge : n.badge) ? <span className="world-badge is-inline">{n.key === "inbox" ? state.unassignedCount || n.badge : n.badge}</span> : null}
            <Icon name="chevron" size={16} className="world-menu-chevron" />
          </Link>
        </li>)}
      </ul>
      <div className="world-menu-account">
        <span className="world-menu-avatar" aria-hidden>{Array.from(viewer.name)[0]}</span>
        <span><strong>{viewer.name}</strong><small>{viewer.roleLabel}</small></span>
        <form action="/auth/signout" method="post"><button type="submit" aria-label={viewer.signOut} title={viewer.signOut}><Icon name="logout" size={17} /></button></form>
      </div>
    </nav>}

    {!windowOpen && show3d && <>
      <div className="world-rail" role="toolbar" aria-orientation="vertical" aria-label={c.camera}>
        {([["overview", "layers", c.overview], ["top", "grid", c.top], ["meeting", "meeting", c.room], ["lounge", "coffee", c.lounge]] as const).map(([view, icon, label]) =>
          <ToolButton key={view} icon={icon} label={label} onClick={() => setView(view)} active={command.view === view && !selectedId} />)}
        <span className="world-rail-sep" />
        <ToolButton icon="plus" label={c.zoomIn} onClick={() => zoom(0.2)} disabled={command.zoom >= 2.2} />
        <ToolButton icon="minus" label={c.zoomOut} onClick={() => zoom(-0.2)} disabled={command.zoom <= 0.55} />
        <ToolButton icon="reset" label={c.reset} onClick={() => setView("overview")} />
        <ToolButton icon={evening ? "moon" : "sun"} label={evening ? c.evening : c.day} onClick={() => setEvening(!evening)} active={evening} />
        <ToolButton icon="people" label={c.names} onClick={() => setShowNames(!showNames)} active={showNames} />
        <span className="world-rail-sep" />
        <ToolButton icon="search" label={`${c.team} (T)`} onClick={() => setTeamOpen(!teamOpen)} active={teamOpen} />
        <ToolButton icon="expand" label={quality === "high" ? c.qualityHigh : c.qualityLow} onClick={toggleQuality} active={quality === "high"} />
        <ToolButton icon="grid" label={c.view2d} onClick={() => setMode("2d")} />
        <ToolButton icon="help" label={help ? c.closeHelp : c.help} onClick={() => setHelp(!help)} active={help} />
      </div>
      {help && <div className="world-help" role="status"><strong>{c.help}</strong><p>{c.clickHint}</p><p>{labels.hint}</p><button type="button" onClick={() => setHelp(false)} aria-label={c.closeHelp}><Icon name="close" size={16} /></button></div>}
    </>}
    {!windowOpen && !show3d && webgl && <button type="button" className="world-mode-back" onClick={() => setMode("3d")}><Icon name="office" size={16} />{c.view3d}</button>}

    {!windowOpen && show3d && (teamOpen || selected) && <aside ref={teamRef} className={cn("world-team", selected && "is-person")} aria-label={c.team}>
      {selected ? <PersonPanel key={selected.id} person={selected} labels={labels} locale={locale} onClose={() => { setTeamOpen(true); setSelectedId(null); }} /> : <>
        <div className="world-team-head"><h2>{c.team}<span>{state.people.length}</span></h2><button type="button" onClick={() => setTeamOpen(false)} aria-label={labels.close}><Icon name="close" size={16} /></button></div>
        <label className="office-search"><Icon name="search" size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={c.search} aria-label={c.search} />{query && <button type="button" onClick={() => setQuery("")} aria-label={c.clearSearch}><Icon name="close" size={14} /></button>}</label>
        <div className="office-roster-filters">{(["all", "office", "meeting", "away"] as const).map((key) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{c[key]}</button>)}</div>
        <div className="world-team-list" aria-live="polite">{people.length ? people.map((p) => <button key={p.id} data-person-id={p.id} type="button" className="office-person-row" onClick={() => setSelectedId(p.id)}>
          <PersonPortrait person={p} /><span className="office-person-info"><strong>{p.nickname ?? p.name}</strong><small>{p.jobTitle ?? labels.roles[p.role]}</small><span className={`person-location-text is-${p.location}`}>{labels.locations[p.location]}</span></span>
          <span className="office-person-work"><span className={`workload-pill is-${workloadLevel(p.workload.open)}`}>{p.workload.open}<small>{c.tasks}</small></span><Icon name="chevron" size={13} /></span>
        </button>) : <div className="office-empty"><Icon name="search" size={25} /><p>{state.people.length ? c.noResults : c.noPeople}</p></div>}</div>
      </>}
    </aside>}

    {windowOpen ? <section ref={windowRef} className={cn("world-window", wide && "is-wide")} style={placeStyle(navKey)} aria-labelledby="world-window-title">
      <div className="world-window-head">
        <h2 id="world-window-title" ref={titleRef} tabIndex={-1}><span className="world-window-art">{current && <Artwork name={artworkFor(current.key)} size={28} />}</span>{current?.key === "dashboard" ? c.myDesk : current?.label}</h2>
        {tabs.length > 1 && <nav className="world-window-tabs" aria-label={current?.label}>{tabs.map((tab) => <Link key={tab.key} href={tab.href} aria-current={tab.key === navKey ? "page" : undefined}>{tab.label}</Link>)}</nav>}
        <span className="world-hud-spacer" />
        <button type="button" className="world-window-tool is-desktop" onClick={() => setWide(!wide)} aria-pressed={wide} aria-label={wide ? c.narrow : c.widen} title={wide ? c.narrow : c.widen}><Icon name="expand" size={16} /></button>
        <kbd className="world-window-esc is-desktop" title={c.escClose}>Esc</kbd>
        <Link href="/office" className="world-window-tool" aria-label={c.backToOffice} title={c.escClose} aria-keyshortcuts="Escape"><Icon name="close" size={18} /></Link>
      </div>
      <div ref={bodyRef} className="world-window-body">{children}</div>
    </section> : <div className="sr-only">{children}</div>}
  </div>;
}
