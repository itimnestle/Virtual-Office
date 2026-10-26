"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CanvasTexture, SRGBColorSpace, type Group, type Mesh } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Box, Cylinder, type Vec3 } from "./office-furniture";
import { SPOT_COLOR, SPOT_ART, type SpotKey } from "@/lib/office/destinations";
import { drawArtwork, type ArtworkName } from "@/lib/office/artwork";

/** A clickable object in the room that opens a page. */
export type SceneHotspot = { key: SpotKey; label: string; badge?: number; active?: boolean };

/** Where each object stands, and where the camera looks when its page is open. */
import { SPOTS } from "@/lib/office/layout";
export { SPOTS };

/**
 * Original vector artwork, a Thai label and a count bubble, painted once.
 */
function makePlaceTexture(label: string, art: ArtworkName, color: { main: string; soft: string; ink: string }, badge: number | undefined, lit: boolean) {
  const scale = 3;
  const font = `600 ${15 * scale}px system-ui, "Segoe UI", "Leelawadee UI", "Noto Sans Thai", sans-serif`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const h = 40 * scale, pad = 6 * scale, tile = 28 * scale, gap = 9 * scale, shadow = 6 * scale;
  const textW = measure.measureText(label).width;
  const badgeW = badge ? Math.max(22 * scale, measure.measureText(String(badge)).width + 14 * scale) : 0;
  const w = Math.ceil(pad + tile + gap + textW + (badge ? gap + badgeW : 0) + pad * 2);
  const canvas = document.createElement("canvas");
  canvas.width = w + shadow * 2;
  canvas.height = h + shadow * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(shadow, shadow * 0.6);
  const pill = (x: number, y: number, pw: number, ph: number) => { ctx.beginPath(); ctx.roundRect(x, y, pw, ph, ph / 2); };
  ctx.shadowColor = "rgba(40, 60, 50, 0.22)";
  ctx.shadowBlur = shadow;
  ctx.shadowOffsetY = 2 * scale;
  pill(0, 0, w, h);
  ctx.fillStyle = lit ? color.main : "#ffffff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.arc(pad + tile / 2, h / 2, tile / 2, 0, Math.PI * 2);
  ctx.fillStyle = lit ? "rgba(255,255,255,0.9)" : color.soft;
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawArtwork(ctx, art, pad + 2 * scale, (h - tile) / 2 + 2 * scale, tile - 4 * scale);
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.fillStyle = lit ? "#ffffff" : color.ink;
  ctx.fillText(label, pad + tile + gap, h / 2 + 2 * scale);
  if (badge) {
    const bx = pad + tile + gap + textW + gap;
    pill(bx, (h - 24 * scale) / 2, badgeW, 24 * scale);
    ctx.fillStyle = lit ? "#ffffff" : color.main;
    ctx.fill();
    ctx.textAlign = "center";
    ctx.font = `700 ${13 * scale}px system-ui, sans-serif`;
    ctx.fillStyle = lit ? color.ink : "#ffffff";
    ctx.fillText(String(badge), bx + badgeW / 2, h / 2 + scale);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, aspect: canvas.width / canvas.height };
}

function PlaceLabel({ spot, label, badge, lit, y, size }: { spot: SpotKey; label: string; badge?: number; lit: boolean; y: number; size: number }) {
  const { texture, aspect } = useMemo(() => makePlaceTexture(label, SPOT_ART[spot], SPOT_COLOR[spot], badge, lit), [spot, label, badge, lit]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={[0, y, 0]} scale={[size * aspect, size, 1]} renderOrder={11}>
    <spriteMaterial map={texture} depthTest={false} transparent sizeAttenuation={false} />
  </sprite>;
}

function Hotspot({ hotspot, position, rotation = 0, ring, labelY, showLabel, onOpen, children }: {
  hotspot: SceneHotspot; position: Vec3; rotation?: number; ring: Vec3; labelY: number; showLabel: boolean; onOpen: (key: SpotKey) => void; children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const invalidate = useThree((s) => s.invalidate);
  const labelScale = useThree((s) => Math.min(1, Math.max(0.5, s.size.width / 900)));
  const lift = useRef<Group>(null);
  const halo = useRef<Mesh>(null);
  const lit = hover || Boolean(hotspot.active);
  const color = SPOT_COLOR[hotspot.key];
  // Hovered objects rise a little and their ring grows; frames are requested only while moving.
  useFrame((_, delta) => {
    if (!lift.current || !halo.current) return;
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 12);
    const y = hover ? 0.09 : 0;
    const s = lit ? 1.15 : 1;
    lift.current.position.y += (y - lift.current.position.y) * k;
    halo.current.scale.setScalar(halo.current.scale.x + (s - halo.current.scale.x) * k);
    if (Math.abs(y - lift.current.position.y) > 0.001 || Math.abs(s - halo.current.scale.x) > 0.001) invalidate();
  });
  return <group position={position} rotation={[0, rotation, 0]}
    onClick={(e) => { e.stopPropagation(); onOpen(hotspot.key); }}
    onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; invalidate(); }}
    onPointerOut={() => { setHover(false); document.body.style.cursor = ""; invalidate(); }}>
    <group ref={lift}>{children}</group>
    {/* Floor ring in the place's colour marks the object as a door to a page. */}
    <group position={[ring[0], 0.075, ring[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={halo}>
        <ringGeometry args={[0.55, 0.7, 48]} />
        <meshBasicMaterial color={color.main} transparent opacity={lit ? 0.95 : 0.6} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, -0.002]}>
        <circleGeometry args={[0.55, 48]} />
        <meshBasicMaterial color={color.soft} transparent opacity={lit ? 0.55 : 0.3} depthWrite={false} />
      </mesh>
    </group>
    {(showLabel || lit) && <PlaceLabel spot={hotspot.key} label={hotspot.label} badge={hotspot.badge} lit={lit} y={labelY} size={(lit ? 0.05 : 0.044) * labelScale} />}
  </group>;
}

function TaskBoard() {
  const notes = ["#f6d38a", "#a9d5c4", "#f2b6a0", "#c7d7f2"];
  return <group>
    {[-1.15, 1.15].map((x) => <Box key={x} position={[x, 0.85, 0]} size={[0.07, 1.7, 0.07]} color="#c9ab82" />)}
    <Box position={[0, 1.6, 0]} size={[2.6, 1.45, 0.08]} color="#e3cfae" round />
    <Box position={[0, 1.6, 0.045]} size={[2.45, 1.3, 0.02]} color="#fbfaf5" />
    {[-0.41, 0.41].map((x) => <Box key={x} position={[x, 1.6, 0.06]} size={[0.015, 1.2, 0.01]} color="#c9cfc6" />)}
    {[0, 1, 2].flatMap((col) => [0, 1, 2].slice(0, 3 - (col === 2 ? 1 : 0)).map((row) =>
      <Box key={`${col}-${row}`} position={[-0.82 + col * 0.82, 2.0 - row * 0.36, 0.07]} size={[0.55, 0.26, 0.012]} color={notes[(col + row) % notes.length]} rotation={[0, 0, (row - 1) * 0.04]} />))}
  </group>;
}

function WallCalendar() {
  return <group>
    <Box position={[0, 1.85, 0.05]} size={[1.1, 1.25, 0.05]} color="#fbfaf5" round />
    <Box position={[0, 2.37, 0.08]} size={[1.1, 0.24, 0.02]} color="#c2574a" />
    {Array.from({ length: 20 }, (_, i) => <Box key={i} position={[-0.39 + (i % 5) * 0.195, 2.08 - Math.floor(i / 5) * 0.2, 0.085]} size={[0.15, 0.15, 0.01]} color={i === 8 ? "#f08a5d" : i % 5 === 4 ? "#f1dcd4" : "#e5e8df"} />)}
    <Box position={[0, 2.52, 0.08]} size={[0.06, 0.12, 0.04]} color="#55615b" />
  </group>;
}

function ReportStand() {
  return <group>
    {[-0.35, 0.35].map((x) => <Box key={x} position={[x, 0.6, -0.15]} size={[0.06, 1.25, 0.06]} color="#5d6862" rotation={[0.18, 0, 0]} />)}
    <Box position={[0, 0.6, -0.4]} size={[0.06, 1.25, 0.06]} color="#5d6862" rotation={[-0.25, 0, 0]} />
    <Box position={[0, 1.55, 0]} size={[1.25, 0.9, 0.06]} color="#ffffff" round />
    <Box position={[0, 1.55, 0.035]} size={[1.12, 0.78, 0.01]} color="#f3f1fd" />
    {[0.3, 0.55, 0.42, 0.68].map((h, i) => <Box key={i} position={[-0.36 + i * 0.24, 1.22 + h / 2, 0.045]} size={[0.13, h, 0.01]} color={["#7b6ee6", "#4c9be8", "#3fae8c", "#f2b33d"][i]} />)}
  </group>;
}

function Mailbox({ unread }: { unread: boolean }) {
  return <group>
    <Cylinder position={[0, 0.5, 0]} radius={0.06} height={1} color="#5d6862" />
    <Box position={[0, 1.12, 0]} size={[0.5, 0.36, 0.7]} color="#4e715a" round />
    <Box position={[0, 1.1, 0.36]} size={[0.32, 0.05, 0.01]} color="#20302a" />
    {/* The flag is raised while there are unread notifications. */}
    <Box position={[0.28, unread ? 1.42 : 1.15, -0.1]} size={[0.03, unread ? 0.4 : 0.06, 0.03]} color="#5d6862" />
    {unread && <Box position={[0.28, 1.58, 0.0]} size={[0.025, 0.16, 0.22]} color="#e0533d" />}
  </group>;
}

function Mirror() {
  return <group>
    <Box position={[0, 1.3, 0.05]} size={[0.95, 2.1, 0.07]} color="#c79e6d" round />
    <Box position={[0, 1.3, 0.095]} size={[0.8, 1.92, 0.01]} color="#d6e6ec" />
    <Box position={[0.18, 1.6, 0.1]} size={[0.06, 1.2, 0.005]} color="#f4f9fb" rotation={[0, 0, 0.3]} />
    <Box position={[0, 0.5, -0.1 + 0.85]} size={[0.9, 0.08, 0.5]} color="#d9c8ae" round />
  </group>;
}

function ServerRack() {
  return <group>
    <Box position={[0, 0.95, 0]} size={[0.8, 1.9, 0.75]} color="#8ea3b1" round />
    {[0, 1, 2, 3, 4].map((i) => <group key={i}>
      <Box position={[0, 0.35 + i * 0.32, 0.38]} size={[0.66, 0.24, 0.01]} color="#eef3f6" />
      <Box position={[-0.24, 0.35 + i * 0.32, 0.39]} size={[0.05, 0.05, 0.01]} color={i === 1 ? "#f6c062" : "#68d391"} />
    </group>)}
  </group>;
}

/** Renders every object the viewer may open; objects for other roles are not drawn. */
export function OfficeHotspots({ hotspots, showLabels, onOpen }: { hotspots: SceneHotspot[]; showLabels: boolean; onOpen: (key: SpotKey) => void }) {
  return <>{hotspots.map((h) => {
    if (h.key === "desk") return null; // the viewer's own desk is drawn by the scene
    const spot = SPOTS[h.key];
    const body = h.key === "tasks" ? <TaskBoard /> : h.key === "calendar" ? <WallCalendar /> : h.key === "reports" ? <ReportStand />
      : h.key === "notifications" ? <Mailbox unread={Boolean(h.badge)} /> : h.key === "me" ? <Mirror /> : h.key === "admin" ? <ServerRack />
      // The meeting screen and the pinboard are drawn by the scene; this is only their
      // invisible hit area, kept off the seats so people there stay clickable.
      : h.key === "meetings" ? <mesh position={[0, 2.1, -3.55]}><boxGeometry args={[3, 1.6, 0.3]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
      : <mesh position={[0, 1.7, 0]}><boxGeometry args={[2.9, 1.6, 0.3]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>;
    return <Hotspot key={h.key} hotspot={h} position={spot.at} rotation={spot.rotation} ring={spot.ring} labelY={spot.labelY} showLabel={showLabels} onOpen={onOpen}>{body}</Hotspot>;
  })}</>;
}

export { Hotspot as DeskHotspot };

