import type { CSSProperties } from "react";

export type IconName = "office" | "grid" | "tasks" | "inbox" | "calendar" | "bell" | "settings" | "people" | "meeting" | "search" | "arrow" | "chevron" | "close" | "sun" | "moon" | "reset" | "plus" | "minus" | "expand" | "layers" | "home" | "coffee" | "clock" | "check" | "logout" | "help" | "chart" | "user" | "shield" | "menu" | "hourglass" | "alert" | "send" | "download";

const paths: Record<IconName, string> = {
  office: "M4 21V7l8-4 8 4v14M2 21h20M8 9v2m4-4v2m4 0v2M8 14v2m4-4v2m4 0v2m-6 5v-4h4v4",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  tasks: "M9 5h11M9 12h11M9 19h11M3 5l1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2",
  inbox: "M4 4h16l2 12v4H2v-4L4 4ZM2 15h6l2 3h4l2-3h6",
  calendar: "M4 5h16v16H4zM8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 4h2",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  settings: "m9 3-1 3-3 1-2 3 2 2v3l3 2 1 4h6l1-4 3-2v-3l2-2-2-3-3-1-1-3H9ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M16 4a4 4 0 0 1 0 8m6 9v-2a4 4 0 0 0-3-4",
  meeting: "M3 4h18v12H9l-6 4V4ZM7 8h10M7 12h6",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  moon: "M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z",
  reset: "M3 10a9 9 0 1 1 1 8M3 3v7h7",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  layers: "m12 3 10 6-10 6L2 9l10-6ZM2 14l10 6 10-6",
  home: "m3 10 9-7 9 7v11h-7v-7h-4v7H3V10Z",
  coffee: "M4 8h12v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Zm12 1h2a3 3 0 1 1 0 6h-2M7 2v3m5-3v3",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  check: "m5 12 4 4L19 6",
  logout: "M9 3H3v18h6m5-14 5 5-5 5m-7-5h14",
  help: "M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  chart: "M4 20V11m6 9V5m6 15v-6m5 6H3",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9",
  alert: "M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
  download: "M12 3v12m-5-5 5 5 5-5M4 21h16",
};

export function Icon({ name, size = 20, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}><path d={paths[name]} /></svg>;
}
