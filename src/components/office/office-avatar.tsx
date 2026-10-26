"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, SRGBColorSpace, type Sprite } from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type { Vec3 } from "./office-furniture";
import { artworkForEmote, drawArtwork } from "@/lib/office/artwork";
import type { Appearance, PetInfo } from "@/lib/office/state";
import { Character, type CharacterPose } from "./office-character";
import { PetModel } from "./office-pet";

/**
 * Procedural low-poly avatar, pet and text sprites shared by the office scene
 * and the character editor preview (placeholders until GLB assets exist).
 */

function makeTextTexture(text: string, bg: string, fg: string, bold: boolean) {
  const px = 48;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `${bold ? 700 : 500} ${px}px system-ui, "Segoe UI", "Leelawadee UI", "Thonburi", "Noto Sans Thai", "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  ctx.font = font;
  const first = text.split(" ")[0];
  const art = artworkForEmote(first);
  const content = art ? text.slice(first.length).trimStart() : text;
  const w = Math.ceil(ctx.measureText(content).width) + px + (art && content ? px : 0);
  const h = Math.ceil(px * 1.6);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  if (art) {
    drawArtwork(ctx, art, content ? px * 0.23 : (w - px) / 2, (h - px) / 2, px);
    ctx.textAlign = "left";
    if (content) ctx.fillText(content, px * 1.4, h / 2 + 2);
  } else ctx.fillText(content, w / 2, h / 2 + 2);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return { texture: tex, aspect: w / h };
}

/** Text as a canvas-texture sprite: system fonts (Thai + emoji), no DOM per frame. */
export function Label({
  text,
  position,
  height = 0.43,
  bg = "rgba(255,255,255,0.92)",
  fg = "#1f2937",
  bold = false,
  fixedSize = false,
}: {
  text: string;
  position: Vec3;
  height?: number;
  bg?: string;
  fg?: string;
  bold?: boolean;
  /** Keep the same size on screen at any zoom; height is then a fraction of the view (≈ 0.02). */
  fixedSize?: boolean;
}) {
  const { texture, aspect } = useMemo(() => makeTextTexture(text, bg, fg, bold), [text, bg, fg, bold]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={10}>
      <spriteMaterial map={texture} depthTest={false} transparent sizeAttenuation={!fixedSize} />
    </sprite>
  );
}

/**
 * An emoji that rises and fades for ~3 s. Rendering stays on-demand: the
 * effect requests frames only while it is animating; with reduced motion it
 * simply shows in place and disappears.
 */
export function FloatingEmote({ text, position, reduceMotion, onDone }: { text: string; position: Vec3; reduceMotion: boolean; onDone: () => void }) {
  const ref = useRef<Sprite>(null);
  const start = useRef<number | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const { texture, aspect } = useMemo(() => makeTextTexture(text, "rgba(255,255,255,0.0)", "#1f2937", false), [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    invalidate();
    if (!reduceMotion) return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [invalidate, reduceMotion, onDone]);
  useFrame((state) => {
    if (reduceMotion || !ref.current) return;
    start.current ??= state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current;
    ref.current.position.y = position[1] + t * 0.55;
    (ref.current.material as { opacity: number }).opacity = Math.max(0, 1 - t / 3);
    if (t < 3) invalidate();
    else onDone();
  });
  return (
    <sprite ref={ref} position={position} scale={[0.75 * aspect, 0.75, 1]} renderOrder={12}>
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  );
}

export type { CharacterPose } from "./office-character";

/**
 * A person in the office: the jointed character plus its name tag, which
 * travels with them when they walk somewhere else.
 */
export function Avatar({
  appearance,
  position,
  label,
  selected = false,
  showName = true,
  onSelect,
  statusBadge,
  pose = "stand",
  facing = 0,
  animate = true,
  seed,
}: {
  appearance: Appearance | null;
  position: Vec3;
  label?: string;
  selected?: boolean;
  showName?: boolean;
  onSelect?: () => void;
  statusBadge?: string | null;
  pose?: CharacterPose;
  facing?: number;
  animate?: boolean;
  seed?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  const hover = (on: boolean) => {
    setHovered(on);
    document.body.style.cursor = on && onSelect ? "pointer" : "";
    invalidate();
  };
  return (
    <Character appearance={appearance} position={position} facing={facing} pose={pose} animate={animate} seed={seed ?? label ?? ""}
      selected={selected} hovered={hovered} onSelect={onSelect} onHover={hover}>
      {label && (showName || selected || hovered) && (
        <Label
          text={statusBadge ? `${statusBadge} ${label}` : label}
          position={[0, pose === "sit_desk" ? 1.62 : 1.98, 0]}
          bg={selected ? "#2f7d6d" : "rgba(255,255,255,0.94)"}
          fg={selected ? "#ffffff" : "#1f2937"}
          height={0.3}
        />
      )}
    </Character>
  );
}

/** A pet beside its owner, with an "@" bubble while the owner has an unread mention. */
export function Pet({
  pet,
  position,
  alert = false,
  onClick,
  animate = false,
}: {
  pet: PetInfo;
  position: Vec3;
  /** Shows an "@" bubble: the owner was @mentioned and has not read it yet. */
  alert?: boolean;
  onClick?: () => void;
  /** Breathing, tail wag / sway and a hop while there is an alert. */
  animate?: boolean;
}) {
  const handle = (e: ThreeEvent<MouseEvent>) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick();
  };
  return (
    <group position={position} onClick={handle}>
      <PetModel pet={pet} animate={animate} alert={alert} />
      {alert ? <Label text="@" position={[0, 0.85, 0]} height={0.32} bg="#f08a5d" fg="#ffffff" bold /> : null}
    </group>
  );
}
