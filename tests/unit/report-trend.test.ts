import { describe, expect, it } from "vitest";
import { buildTrend, delta, previousRange, statusMix, type ReportRow } from "@/lib/reports";

const row = (p: Partial<ReportRow>): ReportRow => ({
  id: Math.random().toString(36).slice(2), team_id: "t", category_id: null, status: "not_started", priority: "medium",
  size: null, is_urgent: false, is_private: false, estimated_hours: null, due_at: null, created_at: "2026-10-01T03:00:00Z",
  completed_at: null, archived_at: null, approved_submitted_at: null, assignee_ids: [], ...p,
});

describe("report trend and comparisons", () => {
  it("previous period has the same length and ends the day before", () => {
    expect(previousRange({ from: "2026-10-01", to: "2026-10-30" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousRange({ from: "2026-10-24", to: "2026-10-24" })).toEqual({ from: "2026-10-23", to: "2026-10-23" });
  });

  it("delta is a whole percentage, null without a base", () => {
    expect(delta(7, 8)).toBe(-12);
    expect(delta(0, 4)).toBe(-100);
    expect(delta(3, 0)).toBeNull();
    expect(delta(0, 0)).toBe(0);
  });

  it("daily trend buckets by Bangkok date and tracks the backlog", () => {
    const rows = [
      row({ created_at: "2026-10-01T18:00:00Z" }), // 02 Oct in Bangkok
      row({ created_at: "2026-10-01T03:00:00Z", status: "completed", completed_at: "2026-10-02T04:00:00Z" }),
      row({ created_at: "2026-10-01T03:00:00Z", status: "cancelled" }),
    ];
    const days = buildTrend(rows, { from: "2026-10-01", to: "2026-10-03" });
    expect(days.map((d) => d.created)).toEqual([2, 1, 0]);
    expect(days.map((d) => d.completed)).toEqual([0, 1, 0]);
    expect(days.map((d) => d.backlog)).toEqual([1, 1, 1]);
    expect(days.map((d) => d.completedAvg)).toEqual([0, 0.5, 0.3]);
  });

  it("status mix counts each task once", () => {
    const now = new Date("2026-10-24T00:00:00Z");
    const mix = statusMix([
      row({ status: "in_review", due_at: "2026-10-01T00:00:00Z" }),
      row({ status: "in_review" }),
      row({ status: "in_progress" }),
      row({ status: "completed" }),
      row({ status: "cancelled" }),
    ], now);
    expect(Object.fromEntries(mix.map((m) => [m.key, m.count]))).toEqual({ open: 1, inReview: 1, overdue: 1, completed: 1 });
  });
});
