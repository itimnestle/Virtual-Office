"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CanvasTexture, LatheGeometry, RepeatWrapping, SRGBColorSpace, Vector2, Vector3, type Group } from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type { Appearance } from "@/lib/office/state";
import { BOTTOM_COLOR, HAIR_COLOR, SHOE_COLOR, SKIN, TOP_COLOR, pick } from "@/lib/office/appearance";

/**
 * Jointed, stylised-realistic office character (≈ 7½ heads tall). Everything
 * is generated locally: shapes from primitives, fabric / denim / knit / hair
 * from small canvas textures. The rig (hips, knees, shoulders, elbows, neck)
 * is posed every frame for breathing, blinking, typing, talking, holding a
 * cup, waving and walking between places. With motion off it holds a pose.
 */

export type CharacterPose = "stand" | "sit_desk" | "talk" | "lounge";
type Vec3 = [number, number, number];

// ---------------------------------------------------------------- textures

const textures = new Map<string, CanvasTexture>();

function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Near-white detail maps; the material colour tints them. Cached and shared. */
function surface(kind: "cotton" | "knit" | "denim" | "hair" | "leather"): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const cached = textures.get(kind);
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rnd = seeded(kind.length * 977);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  if (kind === "knit") {
    ctx.strokeStyle = "rgba(0,0,0,0.13)";
    ctx.lineWidth = 1.4;
    for (let x = 0; x < size; x += 8) for (let y = 0; y < size; y += 6) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y + 5); ctx.lineTo(x + 8, y); ctx.stroke();
    }
  } else if (kind === "denim") {
    ctx.strokeStyle = "rgba(10,20,60,0.16)";
    for (let i = -size; i < size * 2; i += 3) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke(); }
    for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.25})`; ctx.fillRect(rnd() * size, rnd() * size, 1, 1); }
  } else if (kind === "hair") {
    for (let i = 0; i < 160; i++) {
      const x = rnd() * size;
      ctx.strokeStyle = rnd() > 0.7 ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.18)";
      ctx.lineWidth = 0.6 + rnd();
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 6, size * 0.33, x - 6, size * 0.66, x + 2, size); ctx.stroke();
    }
  } else if (kind === "leather") {
    for (let i = 0; i < 500; i++) { ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`; ctx.beginPath(); ctx.arc(rnd() * size, rnd() * size, rnd() * 2, 0, 7); ctx.fill(); }
  } else {
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.07})`; ctx.fillRect(rnd() * size, rnd() * size, 1, 1); }
    ctx.strokeStyle = "rgba(0,0,0,0.035)";
    for (let i = 0; i < size; i += 2) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke(); }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = SRGBColorSpace;
  textures.set(kind, texture);
  return texture;
}

// ---------------------------------------------------------------- small parts

function Part({ children, position, rotation, scale, shadow = true }: { children: ReactNode; position?: Vec3; rotation?: Vec3; scale?: Vec3 | number; shadow?: boolean }) {
  return <mesh position={position} rotation={rotation} scale={scale} castShadow={shadow} receiveShadow>{children}</mesh>;
}

function Mat({ color, map, roughness = 0.72, metalness = 0 }: { color: string; map?: CanvasTexture | null; roughness?: number; metalness?: number }) {
  return <meshStandardMaterial color={color} map={map ?? null} roughness={roughness} metalness={metalness} />;
}

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("")}`;
}

const TORSO_PROFILE: [number, number][] = [[0.148, -0.07], [0.15, 0], [0.152, 0.08], [0.165, 0.18], [0.188, 0.3], [0.196, 0.37], [0.182, 0.43], [0.11, 0.475], [0.05, 0.49]];
let torsoGeometry: LatheGeometry | null = null;
function torso() {
  torsoGeometry ??= new LatheGeometry(TORSO_PROFILE.map(([r, y]) => new Vector2(r, y)), 28);
  return torsoGeometry;
}
let skirtGeometry: LatheGeometry | null = null;
function skirt() {
  skirtGeometry ??= new LatheGeometry([[0.14, 0.04], [0.15, 0], [0.19, -0.14], [0.235, -0.3], [0.24, -0.31]].map(([r, y]) => new Vector2(r, y)), 28);
  return skirtGeometry;
}

// ---------------------------------------------------------------- face

const HEAD_R = 0.115;
const FACE_SCALE: Record<string, Vec3> = { round: [1, 1.08, 1], oval: [0.93, 1.16, 0.98], square: [1.07, 1.04, 1], heart: [1.04, 1.08, 1] };

function Eye({ x, z, style, iris }: { x: number; z: number; style?: string; iris: string }) {
  const closed = style === "happy" || (style === "wink" && x > 0);
  if (closed) {
    return <mesh position={[x, 0.012, z + 0.004]}><torusGeometry args={[0.016, 0.0042, 6, 14, Math.PI]} /><meshStandardMaterial color="#2b211d" roughness={0.6} /></mesh>;
  }
  const big = style === "sparkle";
  return <group position={[x, 0.012, z]} scale={[1, style === "sleepy" ? 0.5 : 1, 1]}>
    <mesh scale={[1, 0.8, 0.42]}><sphereGeometry args={[0.022, 16, 12]} /><meshStandardMaterial color="#fbfaf7" roughness={0.25} /></mesh>
    <mesh position={[0, -0.001, 0.0075]} scale={[1, 1, 0.4]}><sphereGeometry args={[big ? 0.0155 : 0.0128, 14, 10]} /><meshStandardMaterial color={iris} roughness={0.2} /></mesh>
    <mesh position={[0, -0.001, 0.0105]} scale={[1, 1, 0.4]}><sphereGeometry args={[0.0066, 10, 8]} /><meshStandardMaterial color="#0d0b0a" roughness={0.1} /></mesh>
    <mesh position={[0.0042, 0.005, 0.0135]}><sphereGeometry args={[big ? 0.0045 : 0.0034, 8, 6]} /><meshBasicMaterial color="#ffffff" /></mesh>
    {big && <mesh position={[-0.004, -0.004, 0.0135]}><sphereGeometry args={[0.0022, 6, 5]} /><meshBasicMaterial color="#ffffff" /></mesh>}
    {/* Upper lash line */}
    <mesh position={[0, 0.0155, 0.004]} rotation={[0, 0, 0]} scale={[1, 1, 0.5]}><torusGeometry args={[0.02, 0.0028, 4, 12, Math.PI]} /><meshStandardMaterial color="#231a16" /></mesh>
  </group>;
}

function Mouth({ style, z }: { style?: string; z: number }) {
  const lip = "#b65a51";
  if (style === "open") return <group position={[0, -0.054, z]}>
    <mesh scale={[1.25, 0.95, 0.4]}><sphereGeometry args={[0.017, 14, 10]} /><meshStandardMaterial color="#5f2622" roughness={0.5} /></mesh>
    <mesh position={[0, -0.007, 0.002]} scale={[1, 0.5, 0.4]}><sphereGeometry args={[0.012, 10, 8]} /><meshStandardMaterial color="#e2797a" /></mesh>
  </group>;
  if (style === "grin") return <group position={[0, -0.05, z]}>
    <mesh rotation={[0, 0, Math.PI]}><circleGeometry args={[0.026, 20, 0, Math.PI]} /><meshStandardMaterial color="#ffffff" roughness={0.3} /></mesh>
    <mesh rotation={[0, 0, Math.PI]}><torusGeometry args={[0.026, 0.0035, 6, 18, Math.PI]} /><meshStandardMaterial color={lip} /></mesh>
  </group>;
  if (style === "neutral") return <mesh position={[0, -0.054, z]}><boxGeometry args={[0.034, 0.0048, 0.006]} /><meshStandardMaterial color={lip} /></mesh>;
  if (style === "cat") return <group position={[0, -0.052, z]}>{[-0.012, 0.012].map((dx) => <mesh key={dx} position={[dx, 0, 0]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.012, 0.0032, 5, 10, Math.PI]} /><meshStandardMaterial color={lip} /></mesh>)}</group>;
  return <mesh position={[0, -0.046, z]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.023, 0.0042, 6, 18, Math.PI]} /><meshStandardMaterial color={lip} /></mesh>;
}

function Hair({ style, color }: { style?: string; color: string }) {
  const map = surface("hair");
  const m = <meshStandardMaterial color={color} map={map} roughness={0.55} />;
  if (!style || style === "none") return null;
  const r = HEAD_R;
  // Crown cap, tilted back so the hairline sits above the brows.
  const cap = <mesh position={[0, 0.012, -0.006]} rotation={[-0.32, 0, 0]} castShadow>
    <sphereGeometry args={[r * (style === "buzz" ? 1.025 : 1.075), 32, 16, 0, Math.PI * 2, 0, Math.PI * (style === "buzz" ? 0.47 : 0.53)]} />{m}</mesh>;
  // Sides and back, open at the face.
  const shell = (bottom: number, radius = 1.1) => <mesh position={[0, 0.004, -0.004]} castShadow>
    <sphereGeometry args={[r * radius, 32, 18, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, Math.PI * 0.18, Math.PI * bottom]} />{m}</mesh>;
  switch (style) {
    case "buzz": return cap;
    case "short": return <>{cap}{shell(0.42)}<mesh position={[0.03, 0.078, 0.075]} rotation={[0.5, 0, -0.3]} scale={[1.5, 0.45, 0.8]}><sphereGeometry args={[0.045, 14, 10]} />{m}</mesh></>;
    case "bob": return <>{cap}{shell(0.6, 1.14)}</>;
    case "long": return <>{cap}{shell(0.62, 1.13)}
      <mesh position={[0, -0.17, -0.085]} castShadow scale={[1, 1, 0.45]}><capsuleGeometry args={[0.11, 0.2, 6, 16]} />{m}</mesh></>;
    case "bun": return <>{cap}{shell(0.4)}<mesh position={[0, 0.095, -0.085]} castShadow><sphereGeometry args={[0.052, 16, 12]} />{m}</mesh></>;
    case "ponytail": return <>{cap}{shell(0.42)}
      <mesh position={[0, 0.03, -0.122]} rotation={[0.3, 0, 0]}><torusGeometry args={[0.022, 0.008, 6, 12]} /><meshStandardMaterial color="#d9534f" /></mesh>
      <mesh position={[0, -0.09, -0.16]} rotation={[0.28, 0, 0]} castShadow><capsuleGeometry args={[0.032, 0.17, 6, 12]} />{m}</mesh></>;
    case "curly": {
      const curls: Vec3[] = [];
      for (let i = 0; i < 34; i++) {
        const y = 1 - (i / 33) * 1.15;
        const radius = Math.sqrt(Math.max(0, 1 - y * y));
        const a = i * 2.39996;
        const p: Vec3 = [Math.cos(a) * radius * r * 1.06, y * r * 1.04 + 0.01, Math.sin(a) * radius * r * 1.06 - 0.008];
        if (p[2] > 0.06 && p[1] < 0.06) continue; // keep the face clear
        curls.push(p);
      }
      return <>{cap}{curls.map((p, i) => <mesh key={i} position={p} castShadow={i % 3 === 0}><sphereGeometry args={[0.033, 10, 8]} />{m}</mesh>)}</>;
    }
    default: return cap;
  }
}

// ---------------------------------------------------------------- outfit pieces

function Limb({ length, radius, color, map, roughness }: { length: number; radius: number; color: string; map?: CanvasTexture | null; roughness?: number }) {
  return <Part position={[0, -length / 2, 0]}><capsuleGeometry args={[radius, Math.max(0.01, length - radius * 2), 6, 14]} /><Mat color={color} map={map} roughness={roughness} /></Part>;
}

function Shoe({ kind, skin }: { kind?: string; skin: string }) {
  const color = pick(SHOE_COLOR, kind, "#f4efdf");
  if (kind === "sandals") return <group>
    <Part position={[0, -0.012, 0.045]} scale={[1, 0.25, 1]}><boxGeometry args={[0.09, 0.05, 0.24]} /><Mat color={color} map={surface("leather")} /></Part>
    <Part position={[0, 0.012, 0.05]} scale={[1, 0.55, 1]}><capsuleGeometry args={[0.04, 0.12, 4, 10]} /><Mat color={skin} roughness={0.6} /></Part>
    {[0.0, 0.08].map((z) => <Part key={z} position={[0, 0.026, z]} scale={[1, 0.4, 0.3]} shadow={false}><torusGeometry args={[0.042, 0.008, 4, 12, Math.PI]} /><Mat color={color} /></Part>)}
  </group>;
  const boots = kind === "boots";
  return <group>
    <Part position={[0, 0.018, 0.05]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.58]}><capsuleGeometry args={[0.048, 0.15, 6, 14]} /><Mat color={color} map={kind === "sneakers" ? surface("cotton") : surface("leather")} roughness={kind === "loafers" ? 0.32 : 0.7} /></Part>
    <Part position={[0, -0.012, 0.05]}><boxGeometry args={[0.1, 0.02, 0.255]} /><Mat color={kind === "sneakers" ? "#ffffff" : shade(color, -0.12)} roughness={0.8} /></Part>
    {kind === "sneakers" && <Part position={[0.049, 0.02, 0.04]} shadow={false}><boxGeometry args={[0.004, 0.025, 0.12]} /><Mat color="#5cc2ab" /></Part>}
    {boots && <Part position={[0, 0.08, -0.005]}><cylinderGeometry args={[0.058, 0.055, 0.14, 14]} /><Mat color={color} map={surface("leather")} /></Part>}
  </group>;
}

// ---------------------------------------------------------------- rig

type Angles = { hipsY: number; lean: number; thighL: number; thighR: number; kneeL: number; kneeR: number; shXL: number; shXR: number; shZL: number; shZR: number; elbowL: number; elbowR: number; headYaw: number; headPitch: number; breathe: number; bob: number };

const POSES: Record<CharacterPose, Angles> = {
  stand: { hipsY: 0.935, lean: 0, thighL: 0, thighR: 0, kneeL: 0, kneeR: 0, shXL: 0.05, shXR: 0.05, shZL: -0.09, shZR: 0.09, elbowL: 0.12, elbowR: 0.12, headYaw: 0, headPitch: 0, breathe: 0, bob: 0 },
  sit_desk: { hipsY: 0.6, lean: 0.12, thighL: 1.35, thighR: 1.35, kneeL: 1.35, kneeR: 1.35, shXL: 0.75, shXR: 0.75, shZL: -0.06, shZR: 0.06, elbowL: 1.17, elbowR: 1.17, headYaw: 0, headPitch: 0.05, breathe: 0, bob: 0 },
  talk: { hipsY: 0.935, lean: 0.02, thighL: 0, thighR: 0.05, kneeL: 0, kneeR: 0.08, shXL: 0.05, shXR: 0.45, shZL: -0.1, shZR: 0.12, elbowL: 0.15, elbowR: 1.25, headYaw: 0, headPitch: 0, breathe: 0, bob: 0 },
  lounge: { hipsY: 0.935, lean: -0.02, thighL: 0, thighR: 0.08, kneeL: 0, kneeR: 0.14, shXL: 0.05, shXR: 0.35, shZL: -0.1, shZR: 0.05, elbowL: 0.12, elbowR: 1.95, headYaw: 0, headPitch: -0.04, breathe: 0, bob: 0 },
};

/** Desired joint angles for this instant; the rig eases towards them. */
function targetAngles(pose: CharacterPose, t: number, walking: boolean, waving: boolean, live: boolean): Angles {
  const a = { ...POSES[walking ? "stand" : pose] };
  if (live) {
    a.breathe = Math.sin(t * 1.7) * 0.012;
    a.headYaw = Math.sin(t * 0.31) * 0.22 + Math.sin(t * 0.83) * 0.06;
    a.headPitch += Math.sin(t * 0.47) * 0.04;
    a.shXL += Math.sin(t * 1.7) * 0.015;
    a.shXR += Math.sin(t * 1.7 + 0.4) * 0.015;
  }
  if (walking) {
    const w = t * 8.5;
    a.thighL = Math.sin(w) * 0.55; a.thighR = -Math.sin(w) * 0.55;
    a.kneeL = Math.max(0, -Math.sin(w - 0.6)) * 0.8; a.kneeR = Math.max(0, Math.sin(w - 0.6)) * 0.8;
    a.shXL = -Math.sin(w) * 0.42; a.shXR = Math.sin(w) * 0.42;
    a.elbowL = a.elbowR = 0.35;
    a.bob = Math.abs(Math.cos(w)) * 0.035;
    a.headYaw *= 0.2;
  } else if (live && pose === "sit_desk") {
    // Typing: small alternating hand taps, eyes on the screen with an occasional glance away.
    a.elbowL += Math.sin(t * 13) * 0.035; a.elbowR += Math.sin(t * 13 + 2.1) * 0.035;
    a.shXL += Math.sin(t * 6.5) * 0.02; a.shXR += Math.sin(t * 6.5 + 1) * 0.02;
    a.headYaw = Math.sin(t * 0.21) > 0.85 ? 0.45 : Math.sin(t * 0.37) * 0.08;
  } else if (live && pose === "talk") {
    a.shXR += Math.sin(t * 2.1) * 0.22; a.elbowR += Math.sin(t * 3.3) * 0.25; a.shZR += Math.sin(t * 1.3) * 0.12;
    a.headYaw = Math.sin(t * 0.6) * 0.45;
  } else if (live && pose === "lounge") {
    // Sip now and then.
    const sip = Math.max(0, Math.sin(t * 0.45) - 0.8) * 5;
    a.elbowR += sip * 0.45; a.shXR += sip * 0.3; a.headPitch -= sip * 0.15;
  }
  if (waving) {
    a.shZR = 2.55; a.shXR = 0.25; a.elbowR = 0.35 + (live ? Math.sin(t * 9) * 0.38 : 0);
    a.headYaw = 0;
  }
  return a;
}

export function Character({ appearance, position, facing = 0, pose = "stand", animate = true, seed = "", selected = false, hovered = false, onSelect, onHover, children }: {
  appearance: Appearance | null; position: Vec3; facing?: number; pose?: CharacterPose; animate?: boolean; seed?: string;
  selected?: boolean; hovered?: boolean; onSelect?: () => void; onHover?: (hover: boolean) => void; children?: ReactNode;
}) {
  const a = appearance;
  const skin = pick(SKIN, a?.skin, "#d9a07a");
  const hair = pick(HAIR_COLOR, a?.hair_color, "#2a2522");
  const top = pick(TOP_COLOR, a?.top, "#5cc2ab");
  const bottom = pick(BOTTOM_COLOR, a?.bottom, "#4c5c69");
  const face = FACE_SCALE[a?.face ?? "round"] ?? FACE_SCALE.round;
  const iris = ["tone_4", "tone_5", "tone_6"].includes(a?.skin ?? "") ? "#3a2618" : a?.hair_color === "blue" ? "#3c6e9e" : "#5a3b26";
  const longSleeves = a?.top === "hoodie" || a?.top === "shirt" || a?.top === "blazer" || a?.top === "sweater";
  const topMap = surface(a?.top === "sweater" ? "knit" : "cotton");
  const legMap = surface(a?.bottom === "jeans" ? "denim" : "cotton");
  const bareShins = a?.bottom === "shorts" || a?.bottom === "skirt";
  const phase = useMemo(() => { let h = 7; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0; return (Math.abs(h) % 1000) / 37; }, [seed]);

  const root = useRef<Group>(null);
  const hips = useRef<Group>(null);
  const spine = useRef<Group>(null);
  const chest = useRef<Group>(null);
  const head = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const thighL = useRef<Group>(null), thighR = useRef<Group>(null), kneeL = useRef<Group>(null), kneeR = useRef<Group>(null);
  const shL = useRef<Group>(null), shR = useRef<Group>(null), elL = useRef<Group>(null), elR = useRef<Group>(null);
  const cur = useRef<Angles>({ ...POSES[pose] });
  const at = useRef(new Vector3(...position));
  const yaw = useRef(facing);
  const goal = useMemo(() => new Vector3(...position), [position]);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => { if (!animate) { at.current.copy(goal); yaw.current = facing; } invalidate(); }, [animate, goal, facing, invalidate]);

  useFrame((state, rawDelta) => {
    if (!root.current) return;
    const delta = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime + phase;
    // Walk to a new place instead of teleporting.
    const away = at.current.distanceTo(goal);
    const walking = animate && away > 0.04;
    if (walking) {
      const step = Math.min(away, delta * 1.45);
      const dir = goal.clone().sub(at.current).normalize();
      at.current.addScaledVector(dir, step);
      const heading = Math.atan2(dir.x, dir.z);
      yaw.current += Math.atan2(Math.sin(heading - yaw.current), Math.cos(heading - yaw.current)) * Math.min(1, delta * 8);
    } else {
      at.current.copy(goal);
      const k = animate ? Math.min(1, delta * 5) : 1;
      yaw.current += Math.atan2(Math.sin(facing - yaw.current), Math.cos(facing - yaw.current)) * k;
    }
    const target = targetAngles(pose, t, walking, selected, animate);
    const c = cur.current;
    const k = animate ? 1 - Math.exp(-delta * (walking ? 18 : 7)) : 1;
    for (const key of Object.keys(target) as (keyof Angles)[]) c[key] += (target[key] - c[key]) * k;

    root.current.position.set(at.current.x, at.current.y + c.bob, at.current.z);
    root.current.rotation.y = yaw.current;
    hips.current!.position.y = c.hipsY;
    spine.current!.rotation.x = c.lean;
    chest.current!.scale.set(1 + c.breathe * 0.6, 1 + c.breathe, 1 + c.breathe * 1.4);
    thighL.current!.rotation.x = -c.thighL; thighR.current!.rotation.x = -c.thighR;
    kneeL.current!.rotation.x = c.kneeL; kneeR.current!.rotation.x = c.kneeR;
    shL.current!.rotation.set(-c.shXL, 0, c.shZL); shR.current!.rotation.set(-c.shXR, 0, c.shZR);
    elL.current!.rotation.x = -c.elbowL; elR.current!.rotation.x = -c.elbowR;
    head.current!.rotation.set(c.headPitch - c.lean * 0.5, c.headYaw, 0);
    // Blink every few seconds.
    const blink = animate && (t % (3.2 + (phase % 1.7))) < 0.13;
    eyes.current!.scale.y = blink ? 0.12 : 1;
  });

  const arm = (side: 1 | -1) => {
    const sleeve = longSleeves ? top : skin;
    return <group ref={side < 0 ? shL : shR} position={[side * 0.205, 0.415, 0]}>
      <Part position={[0, 0, 0]}><sphereGeometry args={[0.058, 16, 12]} /><Mat color={top} map={topMap} /></Part>
      {/* Upper arm: short sleeve over skin, or a full sleeve */}
      {longSleeves ? <Limb length={0.29} radius={0.056} color={top} map={topMap} /> : <>
        <Part position={[0, -0.06, 0]}><cylinderGeometry args={[0.057, 0.053, 0.13, 16]} /><Mat color={top} map={topMap} /></Part>
        <Limb length={0.29} radius={0.048} color={skin} roughness={0.6} />
      </>}
      <group ref={side < 0 ? elL : elR} position={[0, -0.29, 0]}>
        {/* Elbow joint closes the gap between upper arm and forearm. */}
        <Part shadow={false}><sphereGeometry args={[longSleeves ? 0.05 : 0.043, 14, 10]} /><Mat color={sleeve} map={longSleeves ? topMap : null} roughness={longSleeves ? 0.72 : 0.6} /></Part>
        <Limb length={0.24} radius={longSleeves ? 0.05 : 0.042} color={sleeve} map={longSleeves ? topMap : null} roughness={longSleeves ? 0.72 : 0.6} />
        {a?.top === "sweater" && <Part position={[0, -0.21, 0]} shadow={false}><cylinderGeometry args={[0.045, 0.045, 0.04, 14]} /><Mat color={shade(top, -0.06)} map={surface("knit")} /></Part>}
        {/* Hand with thumb */}
        <group position={[0, -0.285, 0.004]}>
          <Part scale={[0.75, 1, 0.5]}><sphereGeometry args={[0.044, 14, 10]} /><Mat color={skin} roughness={0.6} /></Part>
          <Part position={[side * -0.026, 0.008, 0.016]} rotation={[0.3, 0, side * 0.5]} shadow={false}><capsuleGeometry args={[0.011, 0.03, 4, 8]} /><Mat color={skin} roughness={0.6} /></Part>
          {pose === "lounge" && side > 0 && <group position={[0, -0.01, 0.045]}>
            <Part><cylinderGeometry args={[0.035, 0.03, 0.09, 16]} /><Mat color="#ffffff" roughness={0.3} /></Part>
            <Part position={[0, 0.043, 0]} shadow={false}><cylinderGeometry args={[0.031, 0.031, 0.004, 16]} /><Mat color="#6f4630" /></Part>
          </group>}
        </group>
      </group>
    </group>;
  };

  const leg = (side: 1 | -1) => <group ref={side < 0 ? thighL : thighR} position={[side * 0.098, -0.03, 0]}>
    {a?.bottom === "shorts" ? <>
      <Part position={[0, -0.1, 0]}><cylinderGeometry args={[0.078, 0.07, 0.22, 16]} /><Mat color={bottom} map={legMap} /></Part>
      <Limb length={0.44} radius={0.06} color={skin} roughness={0.6} />
    </> : <Limb length={0.44} radius={0.08} color={bareShins ? skin : bottom} map={bareShins ? null : legMap} roughness={bareShins ? 0.6 : 0.78} />}
    <group ref={side < 0 ? kneeL : kneeR} position={[0, -0.44, 0]}>
      <Part shadow={false}><sphereGeometry args={[0.064, 14, 10]} /><Mat color={bareShins ? skin : bottom} map={bareShins ? null : legMap} roughness={bareShins ? 0.6 : 0.78} /></Part>
      <Limb length={0.43} radius={0.062} color={bareShins ? skin : bottom} map={bareShins ? null : legMap} roughness={bareShins ? 0.6 : 0.78} />
      <group position={[0, -0.44, 0]}><Shoe kind={a?.shoes} skin={skin} /></group>
    </group>
  </group>;

  const fz = HEAD_R * face[2] * 0.9;
  const click = (e: ThreeEvent<MouseEvent>) => { if (!onSelect) return; e.stopPropagation(); onSelect(); };

  return <group ref={root} position={position} rotation={[0, facing, 0]} onClick={click}
    onPointerOver={(e) => { if (!onSelect) return; e.stopPropagation(); onHover?.(true); }}
    onPointerOut={() => onHover?.(false)}>
    {/* Generous hit area for touch and mouse. */}
    <mesh position={[0, 0.85, 0]}><cylinderGeometry args={[0.38, 0.38, 1.75, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    {(selected || hovered) && <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.4, 0.5, 40]} /><meshBasicMaterial color={selected ? "#3fae8c" : "#ffffff"} transparent opacity={selected ? 0.95 : 0.7} depthWrite={false} />
    </mesh>}
    <group ref={hips} position={[0, POSES[pose].hipsY, 0]}>
      {/* Pelvis */}
      <Part scale={[1, 0.62, 0.76]}><sphereGeometry args={[0.145, 20, 14]} /><Mat color={bottom} map={legMap} /></Part>
      {a?.bottom === "skirt" && <Part><primitive object={skirt()} attach="geometry" /><meshStandardMaterial color={bottom} map={surface("cotton")} roughness={0.8} side={2} /></Part>}
      {(a?.bottom === "pants" || a?.bottom === "jeans") && <Part position={[0, 0.045, 0]} shadow={false}><cylinderGeometry args={[0.142, 0.142, 0.035, 24]} /><Mat color="#3a302a" map={surface("leather")} roughness={0.5} /></Part>}
      {leg(-1)}{leg(1)}
      <group ref={spine} position={[0, 0.06, 0]}>
        <group ref={chest}>
          <Part scale={[1, 1, 0.7]}><primitive object={torso()} attach="geometry" /><Mat color={top} map={topMap} /></Part>
          <TopDetails kind={a?.top} color={top} />
          {a?.accessory === "bowtie" && <group position={[0, 0.455, 0.08]}>
            {[-1, 1].map((s) => <Part key={s} position={[s * 0.026, 0, 0]} rotation={[0, 0, s * Math.PI / 2]} shadow={false}><coneGeometry args={[0.022, 0.045, 12]} /><Mat color="#c0392b" /></Part>)}
            <Part shadow={false}><sphereGeometry args={[0.011, 8, 6]} /><Mat color="#a93226" /></Part>
          </group>}
        </group>
        {arm(-1)}{arm(1)}
        {/* Neck and head */}
        <Part position={[0, 0.5, 0]}><cylinderGeometry args={[0.046, 0.052, 0.09, 16]} /><Mat color={skin} roughness={0.6} /></Part>
        <group ref={head} position={[0, 0.6, 0.005]}>
          <Part scale={face}><sphereGeometry args={[HEAD_R, 36, 28]} /><Mat color={skin} roughness={0.58} /></Part>
          <Part position={[0, -0.066, 0.025]} scale={[a?.face === "heart" ? 0.8 : a?.face === "square" ? 1.08 : 0.95, 0.72, 0.9]}><sphereGeometry args={[0.072, 20, 14]} /><Mat color={skin} roughness={0.58} /></Part>
          {[-1, 1].map((s) => <Part key={s} position={[s * HEAD_R * face[0] * 0.98, -0.004, -0.004]} scale={[0.42, 0.85, 0.62]} shadow={false}><sphereGeometry args={[0.03, 12, 10]} /><Mat color={shade(skin, -0.03)} roughness={0.6} /></Part>)}
          <group ref={eyes}>{[-0.041, 0.041].map((x) => <Eye key={x} x={x} z={fz} style={a?.eyes} iris={iris} />)}</group>
          {[-1, 1].map((s) => <mesh key={s} position={[s * 0.041, 0.047, fz - 0.003]} rotation={[0, 0, s * -0.12 + (a?.eyes === "sleepy" ? s * 0.08 : 0)]}><boxGeometry args={[0.038, 0.0075, 0.008]} /><meshStandardMaterial color={shade(hair, -0.05)} /></mesh>)}
          {a?.nose !== "none" && <mesh position={[0, -0.018, fz + 0.012]} scale={[1, 1.1, 0.9]}><sphereGeometry args={[a?.nose === "round" ? 0.02 : a?.nose === "small" ? 0.011 : 0.015, 14, 10]} /><meshStandardMaterial color={shade(skin, -0.02)} roughness={0.55} /></mesh>}
          <Mouth style={a?.mouth} z={fz + 0.004} />
          {[-1, 1].map((s) => <mesh key={s} position={[s * 0.064, -0.028, fz - 0.006]} rotation={[0, s * 0.5, 0]}><circleGeometry args={[0.016, 16]} /><meshBasicMaterial color="#f08f8f" transparent opacity={0.28} depthWrite={false} /></mesh>)}
          <group scale={[face[0], face[1] * 0.96, face[2]]}><Hair style={a?.hair} color={hair} /></group>
          <HeadAccessories accessory={a?.accessory} glasses={a?.glasses} fz={fz} />
        </group>
      </group>
    </group>
    {children}
  </group>;
}

function TopDetails({ kind, color }: { kind?: string; color: string }) {
  const light = "#f6f3ea";
  const dark = shade(color, -0.12);
  const collar = (c: string) => [-1, 1].map((s) => <Part key={s} position={[s * 0.04, 0.455, 0.075]} rotation={[0.35, s * -0.35, s * 0.55]} shadow={false}><boxGeometry args={[0.06, 0.05, 0.01]} /><Mat color={c} /></Part>);
  const buttons = (ys: number[], c = "#d6d3c8") => ys.map((y) => <Part key={y} position={[0, y, 0.118]} shadow={false}><sphereGeometry args={[0.008, 8, 6]} /><Mat color={c} roughness={0.3} /></Part>);
  switch (kind) {
    case "shirt": return <>{collar(light)}{buttons([0.12, 0.22, 0.32, 0.4])}
      <Part position={[0, 0.25, 0.114]} shadow={false}><boxGeometry args={[0.02, 0.38, 0.004]} /><Mat color={shade(color, 0.06)} /></Part></>;
    case "blazer": return <>
      {/* White shirt in the V, lapels and buttons */}
      <Part position={[0, 0.38, 0.105]} rotation={[0.25, 0, Math.PI]} shadow={false}><coneGeometry args={[0.055, 0.17, 3]} /><Mat color={light} /></Part>
      {[-1, 1].map((s) => <Part key={s} position={[s * 0.045, 0.36, 0.112]} rotation={[0.2, 0, s * 0.42]} shadow={false}><boxGeometry args={[0.035, 0.2, 0.012]} /><Mat color={dark} /></Part>)}
      {buttons([0.15, 0.22], "#2b2b2b")}
      <Part position={[-0.09, 0.3, 0.113]} rotation={[0.15, -0.3, 0]} shadow={false}><boxGeometry args={[0.045, 0.012, 0.004]} /><Mat color="#f2b33d" /></Part></>;
    case "hoodie": return <>
      <Part position={[0, 0.45, -0.035]} rotation={[1.25, 0, 0]} scale={[1, 1, 0.7]}><torusGeometry args={[0.085, 0.045, 10, 20]} /><Mat color={color} map={surface("cotton")} /></Part>
      {[-0.03, 0.03].map((x) => <Part key={x} position={[x, 0.36, 0.118]} shadow={false}><cylinderGeometry args={[0.004, 0.004, 0.11, 6]} /><Mat color={light} /></Part>)}
      <Part position={[0, 0.1, 0.11]} rotation={[0.1, 0, 0]} shadow={false}><boxGeometry args={[0.15, 0.08, 0.012]} /><Mat color={dark} map={surface("cotton")} /></Part></>;
    case "sweater": return <>
      <Part position={[0, 0.47, 0]} shadow={false}><torusGeometry args={[0.05, 0.016, 8, 20]} /><Mat color={dark} map={surface("knit")} /></Part>
      <Part position={[0, -0.05, 0]} scale={[1, 1, 0.7]} shadow={false}><cylinderGeometry args={[0.136, 0.136, 0.05, 24]} /><Mat color={dark} map={surface("knit")} /></Part></>;
    case "polo": return <>{collar(light)}{buttons([0.36, 0.41])}</>;
    default: return <Part position={[0, 0.468, 0.01]} shadow={false}><torusGeometry args={[0.05, 0.011, 8, 20]} /><Mat color={dark} /></Part>;
  }
}

function HeadAccessories({ accessory, glasses, fz }: { accessory?: string; glasses?: string; fz: number }) {
  return <>
    {glasses && glasses !== "none" && <group position={[0, 0.012, fz + 0.016]}>
      {[-0.041, 0.041].map((x) => <group key={x} position={[x, 0, 0]} rotation={[0, 0, glasses === "square" ? Math.PI / 4 : 0]}>
        <mesh><torusGeometry args={[glasses === "square" ? 0.032 : 0.027, 0.0035, 6, glasses === "square" ? 4 : 24]} /><meshStandardMaterial color="#1e2328" roughness={0.3} metalness={0.4} /></mesh>
        <mesh><circleGeometry args={[glasses === "square" ? 0.03 : 0.025, glasses === "square" ? 4 : 24]} /><meshStandardMaterial color="#cfe8f5" transparent opacity={0.18} roughness={0.05} /></mesh>
      </group>)}
      <mesh><boxGeometry args={[0.03, 0.004, 0.004]} /><meshStandardMaterial color="#1e2328" /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 0.104, 0, -0.06]} rotation={[0, s * 0.08, 0]}><boxGeometry args={[0.004, 0.004, 0.12]} /><meshStandardMaterial color="#1e2328" /></mesh>)}
    </group>}
    {accessory === "headphones" && <group>
      <mesh position={[0, 0.02, 0]} rotation={[0, 0, 0]}><torusGeometry args={[0.135, 0.012, 8, 32, Math.PI]} /><meshStandardMaterial color="#3b4a45" roughness={0.4} /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 0.128, 0.0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.045, 0.045, 0.035, 20]} /><meshStandardMaterial color="#5cc2ab" roughness={0.35} /></mesh>)}
    </group>}
    {accessory === "cap" && <group position={[0, 0.075, -0.004]} rotation={[-0.12, 0, 0]}>
      <mesh castShadow><sphereGeometry args={[0.128, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#5f8d79" map={surface("cotton")} /></mesh>
      <mesh position={[0, 0.002, 0.13]} scale={[1, 1, 0.75]}><cylinderGeometry args={[0.1, 0.1, 0.01, 24, 1, false, -Math.PI / 2, Math.PI]} /><meshStandardMaterial color="#4e7765" /></mesh>
      <mesh position={[0, 0.128, 0]}><sphereGeometry args={[0.012, 8, 6]} /><meshStandardMaterial color="#4e7765" /></mesh>
    </group>}
    {accessory === "hat" && <group position={[0, 0.09, -0.005]}>
      <mesh castShadow><cylinderGeometry args={[0.105, 0.125, 0.11, 28]} /><meshStandardMaterial color="#d9bf8c" map={surface("knit")} /></mesh>
      <mesh position={[0, -0.04, 0]} castShadow><cylinderGeometry args={[0.215, 0.215, 0.012, 32]} /><meshStandardMaterial color="#d9bf8c" map={surface("knit")} /></mesh>
      <mesh position={[0, -0.02, 0]}><cylinderGeometry args={[0.127, 0.127, 0.028, 28]} /><meshStandardMaterial color="#7a4e36" /></mesh>
    </group>}
    {accessory === "flower" && <group position={[0.1, 0.07, 0.05]} rotation={[0.3, 0.6, 0]}>
      {[0, 1, 2, 3, 4].map((i) => <mesh key={i} position={[Math.cos(i * 1.2566) * 0.022, Math.sin(i * 1.2566) * 0.022, 0]} scale={[1, 1, 0.5]}><sphereGeometry args={[0.016, 10, 8]} /><meshStandardMaterial color="#f29bb5" /></mesh>)}
      <mesh><sphereGeometry args={[0.012, 8, 6]} /><meshStandardMaterial color="#f2c94c" /></mesh>
    </group>}
  </>;
}

/** Character with hover state handled locally (for previews and simple uses). */
export function StandaloneCharacter(props: Omit<Parameters<typeof Character>[0], "hovered" | "onHover">) {
  const [hovered, setHovered] = useState(false);
  return <Character {...props} hovered={hovered} onHover={setHovered} />;
}
