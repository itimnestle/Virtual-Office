"use client";

import { Artwork } from "@/components/artwork";
import { useEffect, useState, useTransition } from "react";
import { format } from "@/lib/i18n/dictionaries";
import { getSuggestionsAction, type Suggestion } from "./actions";

export type SuggestLabels = {
  title: string;
  formula: string;
  free: string;
  open: string;
  leave: string;
  skill: string;
  anySkill: string;
  loading: string;
};

export type SuggestInput = { size: string | null; estimatedHours: string | null; dueLocal: string | null; skillId: string | null };

/**
 * Rule-based ranking with the reasons spelled out. Clicking a row ticks that
 * person in the form; nothing is assigned until the lead presses Assign.
 */
export function SuggestionPanel({
  teamId,
  input,
  names,
  skills,
  labels,
  onPick,
  onSkill,
}: {
  teamId: string;
  input: SuggestInput;
  names: Map<string, string>;
  skills: { id: string; name: string }[];
  labels: SuggestLabels;
  onPick: (userId: string) => void;
  onSkill: (skillId: string | null) => void;
}) {
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => setRows(await getSuggestionsAction({ teamId, ...input })));
  }, [teamId, input]);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{labels.title}</p>
        {skills.length ? (
          <select
            aria-label={labels.skill}
            className="min-h-8 rounded-lg border border-border bg-surface px-2 text-xs"
            value={input.skillId ?? ""}
            onChange={(e) => onSkill(e.target.value || null)}
          >
            <option value="">{labels.anySkill}</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <p className="text-xs text-muted">{labels.formula}</p>
      {pending && !rows ? <p className="text-xs text-muted">{labels.loading}</p> : null}
      <ol className="flex flex-col gap-1" aria-busy={pending}>
        {(rows ?? []).slice(0, 5).map((r, i) => (
          <li key={r.userId}>
            <button
              type="button"
              onClick={() => onPick(r.userId)}
              className="flex w-full flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-surface-2"
            >
              <span className="w-4 text-muted">{i + 1}.</span>
              <span className="font-medium">{names.get(r.userId) ?? "?"}</span>
              <span className="rounded-full bg-primary/15 px-2 font-semibold text-primary tabular-nums">{r.score}</span>
              <span className="text-muted">
                {format(labels.free, { free: Math.round(r.freeHours), need: r.neededHours })} · {format(labels.open, { n: r.openTasks })}
                {r.skillLevel !== null && input.skillId ? ` · ${labels.skill} ${r.skillLevel}/5` : ""}
                {r.onLeaveAtDue ? <> · <Artwork name="warning" size={16} className="inline-block align-middle" /> {labels.leave}</> : null}
              </span>
              <span className="w-full pl-6 text-[11px] text-muted">
                {r.components.capacity} + {r.components.workload} + {r.components.skill} + {r.components.availability}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
