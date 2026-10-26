/**
 * Business timezone helpers. The database stores UTC (timestamptz); the
 * organization works in Asia/Bangkok (UTC+7, no DST).
 */
export const BUSINESS_TZ = "Asia/Bangkok";
const BANGKOK_OFFSET = "+07:00";

/** "2026-10-23T17:00" entered in Bangkok time → UTC ISO string. */
export function bangkokLocalToUtcIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("invalid_datetime");
  const d = new Date(`${local}:00${BANGKOK_OFFSET}`);
  if (Number.isNaN(d.getTime())) throw new Error("invalid_datetime");
  return d.toISOString();
}

export function formatBangkok(iso: string | null | undefined, locale: "th" | "en", withTime = true): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    timeZone: BUSINESS_TZ,
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(new Date(iso));
}

/** Calendar date (YYYY-MM-DD) in Bangkok for a UTC instant. */
export function bangkokDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ }).format(at);
}

/** Working day = Monday–Saturday in Bangkok (Sunday off). Holidays come in Milestone C. */
export function isWorkingDay(at: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, weekday: "short" }).format(at);
  return weekday !== "Sun";
}
