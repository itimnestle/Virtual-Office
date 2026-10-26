/**
 * FUTURE-ONLY extension contracts (Blueprint: "Future only"). Nothing in V1
 * implements, imports or calls these — there is no Microsoft 365 / Outlook
 * connection and no AI/LLM call anywhere in the app. They document the seams
 * where those integrations would plug in without changing business rules.
 *
 * Ground rules for any future implementation:
 *  - Runs server-side only, as an explicit opt-in per organization
 *    (an `integration_connections` row created by an Admin).
 *  - Never receives private task details unless the acting user may open them.
 *  - Suggestions only: AI output lands in the Unassigned Inbox / as drafts; a
 *    lead always decides (no automatic assignment, no automatic date changes).
 */

/** Microsoft 365 / Outlook calendar sync (one-way first: tasks & leave → calendar). */
export interface CalendarProvider {
  readonly id: "m365";
  /** Publishes a due date / meeting to the user's external calendar. Returns the external event id. */
  upsertEvent(input: {
    userId: string;
    title: string;
    startsAt: string; // ISO UTC
    endsAt: string; // ISO UTC
    timezone: "Asia/Bangkok";
    externalId?: string;
    /** Private tasks are published as "Busy" without title or details. */
    visibility: "normal" | "busy-only";
  }): Promise<{ externalId: string }>;
  removeEvent(input: { userId: string; externalId: string }): Promise<void>;
}

/** Optional AI extraction of action items from pasted meeting notes. */
export interface MeetingActionExtractor {
  readonly id: string;
  /**
   * Proposes action items from a meeting summary. Results are inserted as
   * UNASSIGNED meeting_action_items for a lead to review — never as tasks.
   */
  propose(input: { meetingId: string; summary: string; locale: "th" | "en" }): Promise<{ title: string; rationale: string }[]>;
}

/** Marker so code reviews can grep for accidental V1 usage. */
export const FUTURE_INTEGRATIONS_ENABLED = false as const;
