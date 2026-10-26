import { describe, expect, it } from "vitest";
import { addDays, addMonths, eachDay, isDateString, isoWeekday, shiftAnchor, startOfWeek, viewRange } from "@/lib/calendar";

describe("calendar date math", () => {
  it("validates calendar dates", () => {
    expect(isDateString("2026-10-23")).toBe(true);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-1-3")).toBe(false);
    expect(isDateString(undefined)).toBe(false);
  });

  it("uses Monday-start weeks", () => {
    expect(isoWeekday("2026-10-25")).toBe(7); // Sunday
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19");
    expect(startOfWeek("2026-10-26")).toBe("2026-10-26");
  });

  it("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("month", "2026-12-15", 1)).toBe("2027-01-01");
  });

  it("pads month views to whole weeks", () => {
    const r = viewRange("month", "2026-11-10");
    expect(r).toEqual({ from: "2026-10-26", to: "2026-12-06", focusMonth: "2026-11" });
    expect(eachDay(r.from, r.to)).toHaveLength(42);
    expect(viewRange("week", "2026-10-23")).toEqual({ from: "2026-10-19", to: "2026-10-25", focusMonth: null });
  });
});
