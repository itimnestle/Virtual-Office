import type { NavKey } from "@/lib/rbac";
import type { ArtworkName } from "./artwork";

/**
 * The app is one 3D office: every page is opened from an object in the room.
 * A "spot" is that object (and where the camera flies to); routes map onto it.
 */
export type SpotKey = "desk" | "tasks" | "inbox" | "meetings" | "calendar" | "reports" | "notifications" | "me" | "admin";

/** Which object opens which page. Admin pages share one object (the IT rack). */
export const SPOT_ROUTE: Record<SpotKey, NavKey> = {
  desk: "dashboard",
  tasks: "tasks",
  inbox: "inbox",
  meetings: "meetings",
  calendar: "calendar",
  reports: "reports",
  notifications: "notifications",
  me: "me",
  admin: "adminUsers",
};

export const SPOT_ART: Record<SpotKey, ArtworkName> = {
  desk: "desk", tasks: "tasks", inbox: "inbox", meetings: "meetings",
  calendar: "calendar", reports: "reports", notifications: "notifications", me: "me", admin: "admin",
};

/**
 * Each place has its own friendly colour, used for its label and ring in the
 * room and its icon tile in the menu and window. `ink` is readable on `soft`.
 */
export const SPOT_COLOR: Record<SpotKey | "settings", { main: string; soft: string; ink: string }> = {
  desk: { main: "#3fae8c", soft: "#dcf3ea", ink: "#1f6b53" },
  tasks: { main: "#f2b33d", soft: "#fdf0d2", ink: "#8a5a06" },
  inbox: { main: "#ef7f5e", soft: "#fde3da", ink: "#9a3f22" },
  meetings: { main: "#4c9be8", soft: "#ddebfb", ink: "#1f5f9e" },
  calendar: { main: "#e5636f", soft: "#fbe0e3", ink: "#9c2b37" },
  reports: { main: "#7b6ee6", soft: "#e8e5fb", ink: "#4a3db0" },
  notifications: { main: "#f39a4b", soft: "#fde8d3", ink: "#94521a" },
  me: { main: "#c46fd1", soft: "#f5e2f8", ink: "#7d3289" },
  admin: { main: "#5f7a8c", soft: "#e3eaef", ink: "#34505f" },
  settings: { main: "#7d8a83", soft: "#e9eeeb", ink: "#46524c" },
};

export function colorForNavKey(key: NavKey | null) {
  const spot = spotForNavKey(key);
  return SPOT_COLOR[spot ?? "settings"];
}

/** Nav keys that are grouped in one window (shown as tabs). */
export const ROUTE_GROUPS: NavKey[][] = [["adminUsers", "adminConfig", "health"]];

/** The page (nav key) a pathname belongs to; null for the office itself. */
export function navKeyForPath(pathname: string, hrefs: { key: NavKey; href: string }[]): NavKey | null {
  if (pathname === "/office" || pathname === "/") return null;
  // Longest prefix wins, so /admin/config is not matched as /admin/users.
  const match = hrefs
    .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.key ?? null;
}

/** The object the camera should look at for a page; null keeps the current view. */
export function spotForNavKey(key: NavKey | null): SpotKey | null {
  if (!key) return null;
  if (key === "adminUsers" || key === "adminConfig" || key === "health") return "admin";
  const entry = (Object.entries(SPOT_ROUTE) as [SpotKey, NavKey][]).find(([, k]) => k === key);
  return entry ? entry[0] : null;
}
