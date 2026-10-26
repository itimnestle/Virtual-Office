import { describe, expect, it } from "vitest";
import { buildReport, periodRange, rankPeople, timeliness, type ReportRow } from "@/lib/reports";

const NOW = new Date("2026-10-24T05:00:00Z");
const A = "a";
const B = "b";

function row(p: Partial<ReportRow>): ReportRow {
  return {
    id: Math.random().toString(36).slice(2),
    team_id: "t",
    category_id: null,
    status: "not_started",
    priority: "medium",
    size: "m",
    is_urgent: false,
    is_private: false,
    estimated_hours: 2,
    due_at: null,
    created_at: "2026-10-20T00:00:00Z",
    completed_at: null,
    archived_at: null,
    approved_submitted_at: null,
    assignee_ids: [A],
    ...p,
  } as ReportRow;
}

describe("timeliness", () => {
  it("judges by the approved submission, not the approval time", () => {
    const r = { status: "completed" as const, due_at: "2026-10-20T10:00:00Z", approved_submitted_at: "2026-10-20T09:00:00Z", completed_at: "2026-10-22T09:00:00Z" };
    expect(timeliness(r)).toBe("on_time");
    expect(timeliness({ ...r, approved_submitted_at: "2026-10-21T09:00:00Z" })).toBe("late");
    expect(timeliness({ ...r, due_at: null })).toBe("no_due");
    expect(timeliness({ ...r, status: "in_progress" })).toBe("not_done");
  });
});

describe("buildReport", () => {
  const rows = [
    row({ status: "in_progress", due_at: "2026-10-23T10:00:00Z", estimated_hours: 5, is_urgent: true }), // overdue
    row({ status: "in_review", assignee_ids: [A, B], estimated_hours: 3, category_id: "c1" }),
    row({ status: "completed", archived_at: "2026-10-22T00:00:00Z", due_at: "2026-10-22T10:00:00Z", approved_submitted_at: "2026-10-22T08:00:00Z", category_id: "c1" }),
    row({ status: "completed", archived_at: "2026-10-22T00:00:00Z", due_at: "2026-10-21T10:00:00Z", approved_submitted_at: "2026-10-22T08:00:00Z", assignee_ids: [B] }),
    row({ status: "cancelled", assignee_ids: [B] }),
  ];
  const r = buildReport(rows, [{ id: A, name: "Ann" }, { id: B, name: "Bo" }], NOW);

  it("computes team tiles", () => {
    expect(r.tiles).toEqual({
      total: 5,
      open: 2,
      completed: 2,
      inReview: 1,
      overdue: 1,
      onTime: 1,
      late: 1,
      onTimeRate: 50,
      openHours: 8,
      urgentOpen: 1,
    });
  });

  it("covers all 8 statuses in a fixed order and groups categories", () => {
    expect(r.byStatus.map((s) => s.status)).toHaveLength(8);
    expect(r.byStatus.find((s) => s.status === "completed")?.count).toBe(2);
    expect(r.byCategory[0]).toEqual({ categoryId: null, count: 3, hours: 9 });
  });

  it("counts shared work for every assignee", () => {
    const ann = r.byPerson.find((p) => p.userId === A)!;
    const bo = r.byPerson.find((p) => p.userId === B)!;
    expect(ann).toMatchObject({ open: 2, inReview: 1, completed: 1, onTime: 1, late: 0, overdue: 1, openHours: 8 });
    expect(bo).toMatchObject({ open: 1, inReview: 1, completed: 1, onTime: 0, late: 1, overdue: 0, openHours: 3 });
  });

  it("returns no on-time rate when nothing with a due date was completed", () => {
    expect(buildReport([row({})], [], NOW).tiles.onTimeRate).toBeNull();
  });
});

describe("rankPeople", () => {
  it("orders by on-time, completed, fewer late, fewer overdue, and shares ranks on ties", () => {
    const base = { open: 0, inReview: 0, openHours: 0 };
    const ranked = rankPeople([
      { ...base, userId: "1", name: "C", completed: 3, onTime: 1, late: 2, overdue: 0 },
      { ...base, userId: "2", name: "A", completed: 2, onTime: 2, late: 0, overdue: 0 },
      { ...base, userId: "3", name: "B", completed: 2, onTime: 2, late: 0, overdue: 0 },
      { ...base, userId: "4", name: "D", completed: 3, onTime: 1, late: 2, overdue: 1 },
    ]);
    expect(ranked.map((p) => [p.name, p.rank])).toEqual([
      ["A", 1],
      ["B", 1],
      ["C", 3],
      ["D", 4],
    ]);
  });
});

describe("periodRange", () => {
  it("builds Bangkok calendar windows and validates custom input", () => {
    expect(periodRange("7d", "2026-10-24")).toEqual({ from: "2026-10-18", to: "2026-10-24" });
    expect(periodRange("month", "2026-10-24")).toEqual({ from: "2026-10-01", to: "2026-10-24" });
    expect(periodRange("custom", "2026-10-24", { from: "2026-12-01", to: "2026-01-01" })).toEqual({ from: "2026-09-25", to: "2026-10-24" });
    expect(periodRange("custom", "2026-10-24", { from: "2020-01-01", to: "2026-10-24" }).from).toBe("2024-10-24");
  });
});
