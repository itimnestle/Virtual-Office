/**
 * Pure derivation of the 3D office from authorized data. No I/O here: the
 * server builds the input from the same RLS-scoped queries as the dashboard
 * (task_directory, absence_calendar, meetings), so the scene can never show
 * more than the viewer may see. Redacted (private) directory rows carry no
 * assignees and therefore never attach to anybody's desk.
 */
import type { DirectoryRow, TaskStatus } from "@/lib/data/tasks";

export type OfficeLocation = "director_room" | "manager_desk" | "desk" | "meeting" | "home" | "lounge" | "offsite";

export type OfficeStatusKind = "working" | "focus" | "break" | "offsite";

export type Appearance = {
  skin: string;
  face?: string;
  eyes?: string;
  nose?: string;
  mouth?: string;
  hair: string;
  hair_color: string;
  top: string;
  bottom: string;
  shoes?: string;
  glasses: string;
  accessory: string;
};

export type PetInfo = { species: "dog" | "cat"; breed: string; color: string; outfit?: string; name: string; sound_enabled: boolean };

export type OfficeTask = { id: string; title: string; status: TaskStatus; dueAt: string | null; isUrgent: boolean; size: string | null };

export type OfficePerson = {
  id: string;
  name: string;
  nickname: string | null;
  role: "director" | "manager" | "member";
  jobTitle: string | null;
  appearance: Appearance | null;
  pet: PetInfo | null;
  location: OfficeLocation;
  deskIndex: number | null;
  absence: { part: "full_day" | "am" | "pm" } | null;
  meetingTitle: string | null;
  /** Self-reported status (focus / break / offsite) with an optional note. */
  status: { kind: OfficeStatusKind; note: string | null } | null;
  workload: { open: number; estimatedHours: number; urgent: number; inReview: number };
  nextDue: OfficeTask | null;
  tasks: OfficeTask[];
};

export type OfficeState = {
  people: OfficePerson[];
  unassignedCount: number;
  generatedAt: string;
};

export type OfficeInput = {
  now: Date;
  people: { id: string; full_name: string; nickname: string | null; role: string; job_title: string | null; is_active: boolean }[];
  appearances: (Appearance & { user_id: string })[];
  pets: (PetInfo & { user_id: string })[];
  tasks: DirectoryRow[];
  absences: { user_id: string; starts_on: string; ends_on: string; part: "full_day" | "am" | "pm" }[];
  liveMeetings: { title: string; attendeeIds: string[] }[];
  unassignedCount: number;
  statuses?: { user_id: string; status: OfficeStatusKind; note: string | null; until: string | null }[];
};

const OPEN: TaskStatus[] = ["not_started", "in_progress", "blocked", "in_review", "revision_required", "paused"];

function bangkokDateAndHour(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Absence that applies right now (half days: AM before 12:00, PM from 12:00 Bangkok time). */
function currentAbsence(input: OfficeInput, userId: string): OfficePerson["absence"] {
  const { date, hour } = bangkokDateAndHour(input.now);
  const hit = input.absences.find(
    (a) =>
      a.user_id === userId &&
      a.starts_on <= date &&
      a.ends_on >= date &&
      (a.part === "full_day" || (a.part === "am" && hour < 12) || (a.part === "pm" && hour >= 12)),
  );
  return hit ? { part: hit.part } : null;
}

export function deriveOfficeState(input: OfficeInput): OfficeState {
  const appearance = new Map(input.appearances.map((a) => [a.user_id, a]));
  const pets = new Map(input.pets.map((p) => [p.user_id, p]));

  const staff = input.people
    .filter((p) => p.is_active && (p.role === "director" || p.role === "manager" || p.role === "member"))
    .sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name));

  let desk = 0;
  const people = staff.map<OfficePerson>((p) => {
    const tasks = input.tasks
      .filter((t) => !t.redacted && t.status && OPEN.includes(t.status) && !t.archived_at && t.assignee_ids?.includes(p.id))
      .map<OfficeTask>((t) => ({
        id: t.id,
        title: t.title,
        status: t.status as TaskStatus,
        dueAt: t.due_at,
        isUrgent: Boolean(t.is_urgent),
        size: t.size,
      }))
      .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
    const hours = input.tasks
      .filter((t) => tasks.some((x) => x.id === t.id))
      .reduce((sum, t) => sum + Number(t.estimated_hours ?? 0), 0);

    const absence = currentAbsence(input, p.id);
    const meeting = input.liveMeetings.find((m) => m.attendeeIds.includes(p.id));
    const raw = (input.statuses ?? []).find((x) => x.user_id === p.id);
    const status = raw && (!raw.until || new Date(raw.until) > input.now) && raw.status !== "working" ? raw : null;
    const role = p.role as OfficePerson["role"];
    const home: OfficeLocation = role === "director" ? "director_room" : role === "manager" ? "manager_desk" : "desk";
    const deskIndex = role === "member" ? desk++ : null;

    return {
      id: p.id,
      name: p.full_name,
      nickname: p.nickname,
      role,
      jobTitle: p.job_title,
      appearance: appearance.get(p.id) ?? null,
      pet: pets.get(p.id) ?? null,
      // Precedence: leave > scheduled meeting > self-reported offsite/break > desk.
      location: absence
        ? "home"
        : meeting
          ? "meeting"
          : status?.status === "offsite"
            ? "offsite"
            : status?.status === "break"
              ? "lounge"
              : home,
      deskIndex,
      absence,
      meetingTitle: meeting?.title ?? null,
      status: status ? { kind: status.status, note: status.note } : null,
      workload: {
        open: tasks.length,
        estimatedHours: Math.round(hours * 10) / 10,
        urgent: tasks.filter((t) => t.isUrgent).length,
        inReview: tasks.filter((t) => t.status === "in_review").length,
      },
      nextDue: tasks.find((t) => t.dueAt) ?? null,
      tasks,
    };
  });

  return { people, unassignedCount: input.unassignedCount, generatedAt: input.now.toISOString() };
}

/** Desk monitor colour by visible open work. */
export function workloadLevel(open: number): "idle" | "light" | "busy" | "heavy" {
  if (open === 0) return "idle";
  if (open <= 2) return "light";
  if (open <= 4) return "busy";
  return "heavy";
}
