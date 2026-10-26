import type { Database } from "@/lib/database.types";

type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Navigation only. Authorization is enforced in PostgreSQL (RLS + RPC checks);
 * hiding a link is never the security boundary.
 */
export type NavKey = "dashboard" | "office" | "tasks" | "inbox" | "meetings" | "calendar" | "notifications" | "settings" | "adminUsers" | "adminConfig" | "me" | "reports" | "health";

const ALL: AppRole[] = ["director", "manager", "member", "admin"];

export const NAV: { key: NavKey; href: string; roles: AppRole[] }[] = [
  { key: "dashboard", href: "/dashboard", roles: ALL },
  { key: "office", href: "/office", roles: ALL },
  { key: "tasks", href: "/tasks", roles: ALL },
  { key: "inbox", href: "/inbox", roles: ["director", "manager"] },
  { key: "meetings", href: "/meetings", roles: ALL },
  { key: "calendar", href: "/calendar", roles: ALL },
  { key: "reports", href: "/reports", roles: ALL },
  { key: "notifications", href: "/notifications", roles: ALL },
  { key: "adminUsers", href: "/admin/users", roles: ["admin"] },
  { key: "adminConfig", href: "/admin/config", roles: ["admin"] },
  { key: "health", href: "/admin/health", roles: ["admin"] },
  { key: "me", href: "/me", roles: ["director", "manager", "member"] },
  { key: "settings", href: "/settings", roles: ALL },
];

export function navFor(role: AppRole) {
  return NAV.filter((n) => n.roles.includes(role));
}

/** Who a creator may pick as assignees (UI mirror of public.create_task rules). */
export function assignableScope(role: AppRole, leadsTeam: boolean): "self" | "team" {
  if (role === "member") return "self";
  if (role === "manager" && !leadsTeam) return "self";
  return "team";
}
