"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Field, Input, cn } from "@/components/ui";
import { AVATAR_OPTIONS, PET_BREEDS, PET_COLORS, PET_OUTFITS, type AvatarPart } from "@/lib/office/catalog";
import { HAIR_COLOR, PET_COLOR, SKIN, TOP_COLOR } from "@/lib/office/appearance";
import { playPetSound } from "@/lib/office/sounds";
import type { PetInfo } from "@/lib/office/state";
import { saveAvatarAction, savePetAction } from "./actions";
import { Artwork } from "@/components/artwork";

const CharacterPreview = dynamic(() => import("@/components/office/character-preview"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-surface-2" />,
});

type Labels = {
  avatar: string;
  pet: string;
  preview: string;
  save: string;
  parts: Record<string, string>;
  values: Record<string, string>;
  species: Record<"dog" | "cat", string>;
  breed: string;
  color: string;
  outfit: string;
  petName: string;
  petSound: string;
  petHint: string;
};

const SWATCHES: Partial<Record<AvatarPart, Record<string, string>>> = { skin: SKIN, hair_color: HAIR_COLOR, top: TOP_COLOR };

function Chips({
  options,
  value,
  onChange,
  labels,
  swatches,
  name,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  labels: Record<string, string>;
  swatches?: Record<string, string>;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={cn(
            "flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs",
            value === o ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-surface-2",
          )}
        >
          {swatches?.[o] ? <span className="size-3.5 rounded-full border border-black/10" style={{ background: swatches[o] }} aria-hidden /> : null}
          {labels[o] ?? o}
        </button>
      ))}
    </div>
  );
}

export function CharacterStudio({
  initialAvatar,
  initialPet,
  displayName,
  labels,
}: {
  initialAvatar: Record<AvatarPart, string>;
  initialPet: PetInfo;
  displayName: string;
  labels: Labels;
}) {
  const [avatar, setAvatar] = useState(initialAvatar);
  const [pet, setPet] = useState(initialPet);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = (fn: () => Promise<{ error?: string; message?: string } | undefined>) =>
    start(async () => {
      const r = await fn();
      setMessage(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.message ?? "" });
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{labels.avatar}</h2>
          {(Object.keys(AVATAR_OPTIONS) as AvatarPart[]).map((part) => (
            <div key={part} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{labels.parts[part]}</span>
              <Chips
                name={labels.parts[part]}
                options={AVATAR_OPTIONS[part]}
                value={avatar[part]}
                onChange={(v) => setAvatar((prev) => ({ ...prev, [part]: v }))}
                labels={labels.values}
                swatches={SWATCHES[part]}
              />
            </div>
          ))}
          <Button className="self-start" disabled={pending} onClick={() => save(() => saveAvatarAction(avatar))}>
            {labels.save}
          </Button>
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">{labels.pet}</h2>
            <p className="text-xs text-muted">{labels.petHint}</p>
          </div>
          <Chips
            name={labels.pet}
            options={["dog", "cat"]}
            value={pet.species}
            onChange={(v) => {
              const species = v as "dog" | "cat";
              setPet((prev) => (prev.species === species ? prev : { ...prev, species, breed: PET_BREEDS[species][0] }));
            }}
            labels={labels.species}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{labels.breed}</span>
            <Chips name={labels.breed} options={PET_BREEDS[pet.species]} value={pet.breed} onChange={(breed) => setPet((prev) => ({ ...prev, breed }))} labels={labels.values} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{labels.color}</span>
            <Chips name={labels.color} options={PET_COLORS} value={pet.color} onChange={(color) => setPet((prev) => ({ ...prev, color }))} labels={labels.values} swatches={PET_COLOR} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{labels.outfit}</span>
            <Chips name={labels.outfit} options={PET_OUTFITS} value={pet.outfit ?? "none"} onChange={(outfit) => setPet((prev) => ({ ...prev, outfit }))} labels={labels.values} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={labels.petName} htmlFor="pet-name">
              <Input id="pet-name" value={pet.name} maxLength={40} onChange={(e) => setPet((prev) => ({ ...prev, name: e.target.value }))} />
            </Field>
            <label className="flex items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                checked={pet.sound_enabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setPet((prev) => ({ ...prev, sound_enabled: on }));
                  if (e.target.checked) playPetSound(pet.species);
                }}
              />{" "}
              <Artwork name="sound" size={20} /> {labels.petSound}
            </label>
          </div>
          <Button
            className="self-start"
            disabled={pending || !pet.name.trim()}
            onClick={() => save(() => savePetAction({ ...pet, outfit: (pet.outfit ?? "none") as (typeof PET_OUTFITS)[number], color: pet.color as (typeof PET_COLORS)[number] }))}
          >
            {labels.save}
          </Button>
        </Card>
        {message ? <Alert tone={message.ok ? "ok" : "danger"}>{message.text}</Alert> : null}
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card className="flex flex-col gap-2 p-3">
          <span className="text-sm font-medium">{labels.preview}</span>
          <div className="h-80 overflow-hidden rounded-xl bg-gradient-to-b from-surface to-surface-2">
            <CharacterPreview appearance={avatar} pet={pet} label={`${labels.preview}: ${displayName}`} />
          </div>
          <p className="text-center text-sm font-medium">
            {displayName} <Artwork name={pet.species} size={20} className="inline-block align-middle" /> {pet.name}
          </p>
        </Card>
      </div>
    </div>
  );
}
