"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Group } from "three";
import { useFrame } from "@react-three/fiber";
import type { PetInfo } from "@/lib/office/state";
import { PET_COLOR, PET_OUTFIT_COLOR, pick } from "@/lib/office/appearance";

/**
 * Smooth, breed-aware office pets. Dogs wag, cats sway their tails; both
 * breathe and tilt their heads. All shapes and the fur / tabby textures are
 * generated locally.
 */

type Vec3 = [number, number, number];
const furCache = new Map<string, CanvasTexture>();

function fur(kind: "fur" | "tabby"): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const hit = furCache.get(kind);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 128);
  let seed = kind.length * 131;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 700; i++) {
    const x = rnd() * 128, y = rnd() * 128;
    ctx.strokeStyle = `rgba(0,0,0,${0.04 + rnd() * 0.07})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd() * 3 - 1.5, y + 3 + rnd() * 3); ctx.stroke();
  }
  if (kind === "tabby") {
    ctx.fillStyle = "rgba(70,40,10,0.42)";
    for (let y = 6; y < 128; y += 22) { ctx.beginPath(); ctx.ellipse(64, y, 70, 5, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  furCache.set(kind, t);
  return t;
}

function M({ color, map, rough = 0.85 }: { color: string; map?: CanvasTexture | null; rough?: number }) {
  return <meshStandardMaterial color={color} map={map ?? null} roughness={rough} />;
}

function Mesh({ children, position, rotation, scale, shadow = true }: { children: ReactNode; position?: Vec3; rotation?: Vec3; scale?: Vec3; shadow?: boolean }) {
  return <mesh position={position} rotation={rotation} scale={scale} castShadow={shadow}>{children}</mesh>;
}

function Eye({ x, y, z, iris, slit = false }: { x: number; y: number; z: number; iris: string; slit?: boolean }) {
  return <group position={[x, y, z]}>
    <mesh scale={[1, 1, 0.55]}><sphereGeometry args={[0.019, 12, 10]} /><meshStandardMaterial color={iris} roughness={0.15} /></mesh>
    {slit ? <mesh position={[0, 0, 0.009]}><boxGeometry args={[0.005, 0.026, 0.004]} /><meshStandardMaterial color="#111" /></mesh>
      : <mesh position={[0, 0, 0.007]} scale={[1, 1, 0.5]}><sphereGeometry args={[0.012, 10, 8]} /><meshStandardMaterial color="#111" roughness={0.1} /></mesh>}
    <mesh position={[0.006, 0.007, 0.012]}><sphereGeometry args={[0.005, 6, 5]} /><meshBasicMaterial color="#ffffff" /></mesh>
  </group>;
}

function Outfit({ outfit, cat }: { outfit?: string; cat: boolean }) {
  if (!outfit || outfit === "none") return null;
  const color = PET_OUTFIT_COLOR[outfit] ?? "#d9534f";
  const neck: Vec3 = cat ? [0, 0.28, 0.1] : [0, 0.34, 0.15];
  if (outfit === "bandana") return <group position={neck}>
    <mesh rotation={[Math.PI / 2 - 0.3, 0, 0]}><torusGeometry args={[cat ? 0.07 : 0.085, 0.016, 8, 20]} /><M color={color} /></mesh>
    <mesh position={[0, -0.05, 0.06]} rotation={[0.35, 0, Math.PI]}><coneGeometry args={[0.05, 0.09, 3]} /><M color={color} /></mesh>
  </group>;
  if (outfit === "bow") return <group position={[cat ? 0.05 : 0.06, cat ? 0.47 : 0.54, cat ? 0.14 : 0.2]} rotation={[0, 0, 0.3]}>
    {[-1, 1].map((s) => <mesh key={s} position={[s * 0.025, 0, 0]} rotation={[0, 0, s * Math.PI / 2]}><coneGeometry args={[0.022, 0.045, 12]} /><M color={color} rough={0.5} /></mesh>)}
    <mesh><sphereGeometry args={[0.011, 8, 6]} /><M color={color} /></mesh>
  </group>;
  // Sweater / raincoat: a jacket around the body.
  return <group position={[0, cat ? 0.21 : 0.27, -0.01]} rotation={[Math.PI / 2, 0, 0]}>
    <mesh scale={[1.08, 1, 1.05]}><capsuleGeometry args={[cat ? 0.105 : 0.128, cat ? 0.16 : 0.2, 6, 16]} /><M color={color} map={fur("fur")} rough={outfit === "raincoat" ? 0.35 : 0.9} /></mesh>
  </group>;
}

export function PetModel({ pet, animate, alert }: { pet: PetInfo; animate: boolean; alert: boolean }) {
  const cat = pet.species === "cat";
  const base = pick(PET_COLOR, pet.color, "#f3e2c4");
  const b = pet.breed;
  const point = b === "siamese" ? "#5b463a" : null;
  const light = b === "black_cat" ? "#3a3a3a" : "#fbf6ec";
  const map = fur(b === "tabby" ? "tabby" : "fur");
  const fluffy = b === "poodle" || b === "persian";
  const legLen = cat ? 0.1 : b === "corgi" ? 0.07 : b === "pug" ? 0.1 : b === "golden" ? 0.17 : 0.14;
  const bodyY = legLen + (cat ? 0.1 : 0.12);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const phase = useMemo(() => (pet.name.length * 1.37) % 6, [pet.name]);

  useFrame((state) => {
    if (!body.current || !head.current || !tail.current) return;
    const t = state.clock.elapsedTime + phase;
    if (!animate) { body.current.position.y = 0; tail.current.rotation.set(0, 0, 0); head.current.rotation.set(0, 0, 0); return; }
    body.current.scale.y = 1 + Math.sin(t * 2.6) * 0.02;
    body.current.position.y = alert ? Math.abs(Math.sin(t * 5)) * 0.08 : 0;
    head.current.rotation.z = Math.sin(t * 0.7) > 0.8 ? 0.28 : Math.sin(t * 0.9) * 0.05;
    head.current.rotation.y = Math.sin(t * 0.45) * 0.3;
    if (cat) tail.current.rotation.z = Math.sin(t * 1.6) * 0.35;
    else tail.current.rotation.y = Math.sin(t * (alert ? 16 : 9)) * 0.6;
  });

  const legs: Vec3[] = [[-0.07, 0, 0.11], [0.07, 0, 0.11], [-0.07, 0, -0.11], [0.07, 0, -0.11]];
  const headZ = cat ? 0.17 : b === "corgi" ? 0.23 : 0.21;
  const headY = bodyY + (cat ? 0.13 : 0.15);
  const headR = cat ? 0.098 : b === "pug" ? 0.105 : 0.1;
  const eyeIris = cat ? (b === "siamese" ? "#5fa6e8" : b === "black_cat" ? "#f2c94c" : "#8cc06a") : "#2b1d14";

  return <group ref={body} scale={b === "golden" ? 1.15 : fluffy ? 1.05 : 1}>
    {/* Body */}
    <Mesh position={[0, bodyY, -0.01]} rotation={[Math.PI / 2, 0, 0]} scale={[cat ? 0.95 : 1.05, 1, 1]}>
      <capsuleGeometry args={[cat ? 0.095 : 0.115, b === "corgi" ? 0.26 : cat ? 0.17 : 0.2, 8, 18]} /><M color={base} map={map} />
    </Mesh>
    {!point && b !== "black_cat" && <Mesh position={[0, bodyY - 0.035, 0.09]} scale={[0.75, 0.75, 0.9]} shadow={false}><sphereGeometry args={[0.09, 14, 10]} /><M color={light} map={map} /></Mesh>}
    {fluffy && [-1, 0, 1].map((i) => <Mesh key={i} position={[0, bodyY + 0.07, i * 0.1]}><sphereGeometry args={[0.085, 14, 10]} /><M color={base} map={map} /></Mesh>)}
    {/* Legs and paws */}
    {legs.map(([x, , z], i) => <group key={i} position={[x * (cat ? 0.9 : 1), legLen, z * (b === "corgi" ? 1.25 : cat ? 0.85 : 1)]}>
      <Mesh position={[0, -legLen / 2, 0]}><capsuleGeometry args={[cat ? 0.026 : 0.032, Math.max(0.02, legLen - 0.03), 4, 10]} /><M color={point ?? base} map={map} /></Mesh>
      <Mesh position={[0, -legLen + 0.012, 0.015]} scale={[1, 0.6, 1.2]} shadow={false}><sphereGeometry args={[cat ? 0.03 : 0.036, 10, 8]} /><M color={point ?? (b === "shiba" || b === "corgi" ? light : base)} /></Mesh>
      {fluffy && <Mesh position={[0, -legLen * 0.6, 0]} shadow={false}><sphereGeometry args={[0.045, 10, 8]} /><M color={base} map={map} /></Mesh>}
    </group>)}
    {/* Tail */}
    <group ref={tail} position={[0, bodyY + 0.03, b === "corgi" ? -0.2 : -0.17]}>
      {cat ? <group rotation={[-0.9, 0, 0]}>
        <Mesh position={[0, 0.1, 0]}><capsuleGeometry args={[fluffy ? 0.04 : 0.024, 0.18, 6, 10]} /><M color={point ?? base} map={map} /></Mesh>
        <Mesh position={[0, 0.2, 0.045]} rotation={[0.7, 0, 0]}><capsuleGeometry args={[fluffy ? 0.038 : 0.022, 0.08, 6, 10]} /><M color={point ?? base} map={map} /></Mesh>
      </group>
      : b === "shiba" || b === "pug" ? <Mesh position={[0, 0.08, -0.02]} rotation={[0.2, Math.PI / 2, 0]}><torusGeometry args={[0.05, b === "pug" ? 0.02 : 0.03, 8, 16, Math.PI * 1.6]} /><M color={base} map={map} /></Mesh>
      : b === "corgi" ? <Mesh position={[0, 0.01, -0.02]}><sphereGeometry args={[0.035, 10, 8]} /><M color={base} map={map} /></Mesh>
      : <group rotation={[-0.75, 0, 0]}>
        <Mesh position={[0, 0.09, 0]}><capsuleGeometry args={[b === "golden" ? 0.03 : 0.022, 0.13, 6, 10]} /><M color={base} map={map} /></Mesh>
        {b === "poodle" && <Mesh position={[0, 0.18, 0]}><sphereGeometry args={[0.05, 12, 10]} /><M color={base} map={map} /></Mesh>}
      </group>}
    </group>
    {/* Head */}
    <group ref={head} position={[0, headY, headZ]}>
      <Mesh scale={b === "persian" ? [1.18, 1, 0.92] : b === "pug" ? [1.1, 1, 0.95] : [1, 1, 1]}><sphereGeometry args={[headR, 22, 18]} /><M color={base} map={map} /></Mesh>
      {fluffy && <Mesh position={[0, 0.07, -0.01]}><sphereGeometry args={[0.075, 12, 10]} /><M color={base} map={map} /></Mesh>}
      {/* Muzzle */}
      {!cat ? <Mesh position={[0, -0.03, headR * 0.82]} scale={[1, 0.8, b === "pug" ? 0.45 : 1]}>
        <sphereGeometry args={[0.058, 16, 12]} /><M color={b === "pug" ? "#3d3430" : b === "shiba" || b === "corgi" ? light : base} map={map} />
      </Mesh> : <Mesh position={[0, -0.025, headR * 0.86]} scale={[1.2, 0.75, 0.6]} shadow={false}><sphereGeometry args={[0.035, 12, 10]} /><M color={point ?? light} /></Mesh>}
      <Mesh position={[0, cat ? -0.015 : -0.012, headR * (cat ? 1.02 : b === "pug" ? 1.05 : 1.38)]} shadow={false}><sphereGeometry args={[cat ? 0.011 : 0.02, 10, 8]} /><M color={cat ? "#e8848f" : "#1c1716"} rough={0.3} /></Mesh>
      {/* Eyes */}
      {[-1, 1].map((s) => <Eye key={s} x={s * (cat ? 0.038 : 0.042)} y={0.022} z={headR * 0.84} iris={eyeIris} slit={cat} />)}
      {cat && [-1, 1].flatMap((s) => [0, 1].map((k) => <mesh key={`${s}${k}`} position={[s * 0.06, -0.03 - k * 0.012, headR * 0.82]} rotation={[0, 0, s * (0.1 - k * 0.2)]}>
        <boxGeometry args={[0.07, 0.0025, 0.0025]} /><meshBasicMaterial color={b === "black_cat" ? "#777" : "#ffffff"} /></mesh>))}
      {/* Ears */}
      {[-1, 1].map((s) => {
        const earColor = point ?? (b === "golden" || b === "poodle" ? "#c79a6b" : base);
        if (cat) return b === "scottish_fold"
          ? <Mesh key={s} position={[s * 0.055, 0.085, 0.02]} rotation={[0.9, 0, s * -0.3]} scale={[1, 0.5, 1]}><coneGeometry args={[0.03, 0.04, 12]} /><M color={earColor} map={map} /></Mesh>
          : <Mesh key={s} position={[s * 0.058, 0.09, 0.0]} rotation={[0, 0, s * -0.3]}><coneGeometry args={[0.038, 0.075, 12]} /><M color={earColor} map={map} /></Mesh>;
        if (b === "shiba" || b === "corgi") return <Mesh key={s} position={[s * 0.06, 0.1, -0.005]} rotation={[0, 0, s * -0.25]}><coneGeometry args={[b === "corgi" ? 0.045 : 0.036, b === "corgi" ? 0.1 : 0.08, 12]} /><M color={earColor} map={map} /></Mesh>;
        if (b === "pug") return <Mesh key={s} position={[s * 0.085, 0.06, 0.01]} rotation={[0.4, 0, s * 0.9]} scale={[1, 0.4, 1]}><sphereGeometry args={[0.035, 10, 8]} /><M color="#3d3430" /></Mesh>;
        return <Mesh key={s} position={[s * 0.095, -0.01, -0.005]} rotation={[0, 0, s * 0.25]} scale={[0.5, 1, 0.9]}><capsuleGeometry args={[0.035, 0.07, 6, 10]} /><M color={earColor} map={map} /></Mesh>;
      })}
      {!cat && <mesh position={[0, -0.062, headR * 1.12]} rotation={[0.2, 0, 0]}><boxGeometry args={[0.03, 0.004, 0.004]} /><meshStandardMaterial color="#5a2f2a" /></mesh>}
      {!cat && alert && <mesh position={[0, -0.075, headR * 1.12]} scale={[1, 1.3, 0.5]}><sphereGeometry args={[0.014, 10, 8]} /><meshStandardMaterial color="#ef7f8a" /></mesh>}
    </group>
    <Outfit outfit={pet.outfit} cat={cat} />
  </group>;
}
