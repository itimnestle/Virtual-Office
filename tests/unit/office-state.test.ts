import { describe, expect, it } from "vitest";
import type { DirectoryRow } from "@/lib/data/tasks";
import { deriveOfficeState, workloadLevel, type OfficeInput } from "@/lib/office/state";

const M1 = "m1";
const M2 = "m2";

function row(partial: Partial<DirectoryRow> & { id: string }): DirectoryRow {
  return {
    team_id: "t",
    title: partial.id,
    is_private: false,
    redacted: false,
    status: "not_started",
    priority: "medium",
    is_urgent: false,
    size: "m",
    estimated_hours: 2,
    due_at: null,
    created_by: "x",
    created_at: "2026-10-01T00:00:00Z",
    archived_at: null,
    assignee_ids: [M1],
    is_new_today: false,
    has_pending_extension: false,
    assignee_absent_today: false,
    is_recurring: false,
    category_id: null,
    tag_ids: null,
    ...partial,
  };
}

function input(over: Partial<OfficeInput> = {}): OfficeInput {
  return {
    // 2026-10-23 10:00 Bangkok (03:00 UTC)
    now: new Date("2026-10-23T03:00:00Z"),
    people: [
      { id: "d", full_name: "Dara", nickname: null, role: "director", job_title: null, is_active: true },
      { id: "mg", full_name: "Mana", nickname: null, role: "manager", job_title: null, is_active: true },
      { id: M1, full_name: "Mali", nickname: "มะลิ", role: "member", job_title: null, is_active: true },
      { id: M2, full_name: "Kanok", nickname: null, role: "member", job_title: null, is_active: true },
      { id: "a", full_name: "Ada", nickname: null, role: "admin", job_title: null, is_active: true },
      { id: "gone", full_name: "Old", nickname: null, role: "member", job_title: null, is_active: false },
    ],
    appearances: [],
    pets: [],
    tasks: [],
    absences: [],
    liveMeetings: [],
    unassignedCount: 2,
    ...over,
  };
}

describe("deriveOfficeState", () => {
  it("places the Director, the Manager and members at stable desks; Admin and inactive people are not in the office", () => {
    const s = deriveOfficeState(input());
    expect(s.people.map((p) => [p.id, p.location, p.deskIndex])).toEqual([
      ["d", "director_room", null],
      ["mg", "manager_desk", null],
      [M2, "desk", 0],
      [M1, "desk", 1],
    ]);
    expect(s.unassignedCount).toBe(2);
  });

  it("moves people home for a leave today and to the meeting room during a live meeting", () => {
    const s = deriveOfficeState(
      input({
        absences: [{ user_id: M1, starts_on: "2026-10-22", ends_on: "2026-10-24", part: "full_day" }],
        liveMeetings: [{ title: "Standup", attendeeIds: [M2, M1] }],
      }),
    );
    expect(s.people.find((p) => p.id === M1)?.location).toBe("home"); // leave wins over meeting
    expect(s.people.find((p) => p.id === M2)).toMatchObject({ location: "meeting", meetingTitle: "Standup" });
  });

  it("self-reported break/offsite move people, but leave and meetings take precedence; statuses lapse", () => {
    const s = deriveOfficeState(
      input({
        statuses: [
          { user_id: M1, status: "offsite", note: "พบลูกค้า", until: null },
          { user_id: M2, status: "break", note: null, until: "2026-10-23T02:00:00Z" }, // lapsed 09:00 BKK
          { user_id: "mg", status: "break", note: null, until: null },
          { user_id: "d", status: "offsite", note: null, until: null },
        ],
        liveMeetings: [{ title: "Board", attendeeIds: ["d"] }],
      }),
    );
    expect(s.people.find((p) => p.id === M1)).toMatchObject({ location: "offsite", status: { kind: "offsite", note: "พบลูกค้า" } });
    expect(s.people.find((p) => p.id === M2)).toMatchObject({ location: "desk", status: null });
    expect(s.people.find((p) => p.id === "mg")?.location).toBe("lounge");
    expect(s.people.find((p) => p.id === "d")?.location).toBe("meeting");
  });

  it("applies half-day leave by Bangkok time (AM before noon, PM after)", () => {
    const am = input({ absences: [{ user_id: M1, starts_on: "2026-10-23", ends_on: "2026-10-23", part: "am" }] });
    expect(deriveOfficeState(am).people.find((p) => p.id === M1)?.location).toBe("home");
    const pmBeforeNoon = input({ absences: [{ user_id: M1, starts_on: "2026-10-23", ends_on: "2026-10-23", part: "pm" }] });
    expect(deriveOfficeState(pmBeforeNoon).people.find((p) => p.id === M1)?.location).toBe("desk");
    const afternoon = { ...pmBeforeNoon, now: new Date("2026-10-23T06:30:00Z") }; // 13:30 BKK
    expect(deriveOfficeState(afternoon).people.find((p) => p.id === M1)?.location).toBe("home");
  });

  it("counts only open, visible work; redacted private rows never attach to anyone", () => {
    const s = deriveOfficeState(
      input({
        tasks: [
          row({ id: "a", due_at: "2026-10-30T10:00:00Z", estimated_hours: 3 }),
          row({ id: "b", is_urgent: true, due_at: "2026-10-25T10:00:00Z", estimated_hours: 1.5 }),
          row({ id: "c", status: "completed", archived_at: "2026-10-20T00:00:00Z" }),
          row({ id: "secret", redacted: true, is_private: true, status: null, assignee_ids: null }),
        ],
      }),
    );
    const m1 = s.people.find((p) => p.id === M1)!;
    expect(m1.workload).toEqual({ open: 2, estimatedHours: 4.5, urgent: 1, inReview: 0 });
    expect(m1.nextDue?.id).toBe("b");
    expect(JSON.stringify(s)).not.toContain("secret");
  });

  it("E. a status change made in 2D shows up in the 3D state", () => {
    const before = deriveOfficeState(input({ tasks: [row({ id: "a", status: "in_progress" })] }));
    const after = deriveOfficeState(input({ tasks: [row({ id: "a", status: "in_review" })] }));
    expect(before.people.find((p) => p.id === M1)?.workload.inReview).toBe(0);
    expect(after.people.find((p) => p.id === M1)?.workload.inReview).toBe(1);
    const archived = deriveOfficeState(input({ tasks: [row({ id: "a", status: "completed", archived_at: "2026-10-23T00:00:00Z" })] }));
    expect(archived.people.find((p) => p.id === M1)?.workload.open).toBe(0);
  });

  it("maps workload to monitor colour levels", () => {
    expect([0, 1, 3, 6].map(workloadLevel)).toEqual(["idle", "light", "busy", "heavy"]);
  });
});
