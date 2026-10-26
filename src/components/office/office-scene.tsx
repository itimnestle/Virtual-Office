"use client";

import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactElement } from "react";
import { CanvasTexture, SRGBColorSpace, Vector3, type PerspectiveCamera } from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Architecture, Desk, LeaveHouse, Lounge, MeetingRoom, Box, type Vec3 } from "./office-furniture";
import type { OfficePerson, OfficeState } from "@/lib/office/state";
import { workloadLevel } from "@/lib/office/state";
import { WORKLOAD_COLOR } from "@/lib/office/appearance";
import { playPetSound } from "@/lib/office/sounds";
import { Avatar, FloatingEmote, Label, Pet, type CharacterPose } from "./office-avatar";
import { GameCorner, OffsiteDoor } from "./office-extras";
import { BOARD, DESKS, DIRECTOR_DESK, HOME, MANAGER_DESK, MEETING_TABLE, deskFor, deskOf, placePeople, roomDepth } from "@/lib/office/layout";
import { DeskHotspot, OfficeHotspots, SPOTS, type SceneHotspot } from "./office-hotspots";
import type { SpotKey } from "@/lib/office/destinations";
import { InteriorDetails } from "./office-surfaces";

// Post-processing is only downloaded in "best visuals" mode.
const OfficeEffects = lazy(() => import("./office-effects"));

/** A chat emotion floating in the room. userId is null for anonymous messages. */
export type SceneEmote = { id: string; text: string; userId: string | null };

const STATUS_BADGE: Record<string, string> = { focus: "🎧", break: "☕", offsite: "🚗" };

/**
 * Self-contained office diorama. Demand rendering avoids idle animation loops;
 * textures use system fonts and every visual is generated locally.
 */

export type CameraCommand = { view: "overview" | "top" | "meeting" | "lounge"; zoom: number; revision: number };

/** Screen area covered by an open page window; the camera centres the room in what is left. */
export type ViewInset = { left?: number; right: number; bottom: number };

/** How someone stands or sits at their current place, and which way they face. */
function stanceFor(person: OfficePerson, at: Vec3): { pose: CharacterPose; facing: number } {
  const toward = (x: number, z: number) => Math.atan2(x - at[0], z - at[2]);
  switch (person.location) {
    case "meeting": return { pose: "talk", facing: toward(MEETING_TABLE[0], MEETING_TABLE[2]) };
    case "lounge": return { pose: "lounge", facing: toward(-8.6, 5) };
    case "offsite": return { pose: "stand", facing: Math.PI / 2 };
    case "home": return { pose: "stand", facing: toward(HOME[0], HOME[2] - 0.3) };
    default: return { pose: "sit_desk", facing: 0 };
  }
}

/** Visual quality: "high" adds image-based light, ambient occlusion and bloom. */
export type SceneQuality = "high" | "low";

/** Requests frames at a steady pace while people are animated and the tab is visible. */
function FrameDriver({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!fps) return;
    const id = window.setInterval(() => { if (document.visibilityState === "visible") invalidate(); }, 1000 / fps);
    return () => window.clearInterval(id);
  }, [fps, invalidate]);
  return null;
}

/** Painted sky behind the room: soft gradient with a few clouds (generated locally). */
function Sky({ evening }: { evening: boolean }) {
  const texture = useMemo(() => {
    const dark = document.documentElement.dataset.theme === "dark";
    const canvas = document.createElement("canvas");
    canvas.width = 32; canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    const stops = dark ? ["#1f2742", "#2f3858", "#454c6e"] : evening ? ["#f0ad8d", "#eabdd0", "#c9bde8"] : ["#a9d8f2", "#d7eff5", "#fbf0dc"];
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 512);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [evening]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <primitive attach="background" object={texture} />;
}

function CameraRig({ command, focus, depth, spot, inset, animate }: { command: CameraCommand; focus: Vec3 | null; depth: number; spot: { target: Vec3; offset: Vec3 } | null; inset: ViewInset; animate: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const previous = useRef<{ command: CameraCommand; aspect: number; focusX: number | undefined; focusZ: number | undefined; depth: number; spotKey: string } | null>(null);
  const flight = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  const { camera, size, invalidate } = useThree();
  const spotKey = spot ? spot.target.join() + "|" + spot.offset.join() : "";
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    if (inset.right > 0 || inset.bottom > 0 || (inset.left ?? 0) > 0) cam.setViewOffset(size.width, size.height, (inset.right - (inset.left ?? 0)) / 2, inset.bottom / 2, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, inset.right, inset.bottom, inset.left, invalidate]);
  useFrame((_, delta) => {
    const f = flight.current;
    if (!f || !controls.current) return;
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 6);
    camera.position.lerp(f.position, k);
    controls.current.target.lerp(f.target, k);
    controls.current.update();
    if (camera.position.distanceTo(f.position) < 0.02 && controls.current.target.distanceTo(f.target) < 0.02) flight.current = null;
    invalidate();
  });
  const aspect = size.width / Math.max(size.height, 1);
  const focusX = focus?.[0];
  const focusZ = focus?.[2];
  useEffect(() => {
    if (!controls.current) return;
    const last = previous.current;
    previous.current = { command, aspect, focusX, focusZ, depth, spotKey };
    // Zoom buttons preserve a camera angle the user has already orbited to.
    if (last && last.command.view === command.view && last.command.revision === command.revision && last.aspect === aspect && last.focusX === focusX && last.focusZ === focusZ && last.depth === depth && last.spotKey === spotKey) {
      const ratio = last.command.zoom / command.zoom;
      camera.position.sub(controls.current.target).multiplyScalar(ratio).add(controls.current.target);
      if (flight.current) flight.current.position.sub(flight.current.target).multiplyScalar(ratio).add(flight.current.target);
      controls.current.update();
      invalidate();
      return;
    }
    const presets: Record<CameraCommand["view"], { target: Vec3; offset: Vec3 }> = {
      overview: { target: [0, 0, (depth - 20) / 2 - 0.5], offset: [25, 27, 32] },
      top: { target: [0, 0, (depth - 20) / 2], offset: [0, 43, 0.1] },
      meeting: { target: [7.3, 0, -5.5], offset: [11, 13, 16] },
      lounge: { target: [-8.3, 0, 4.5], offset: [10, 12, 15] },
    };
    const preset = presets[command.view];
    const target: Vec3 = focusX !== undefined && focusZ !== undefined ? [focusX, 0.5, focusZ] : spot ? spot.target : preset.target;
    const offset: Vec3 = focusX !== undefined ? [10, 11, 14] : spot ? spot.offset : preset.offset;
    const direction = new Vector3(...offset).normalize();
    let distance = new Vector3(...offset).length() * Math.max(1, 1.16 / aspect);
    if (focusX === undefined && !spot && (command.view === "overview" || command.view === "top")) {
      // Fit every corner of the room in perspective, including its wall height.
      // This avoids either clipping or excessive empty space on narrow screens.
      const right = new Vector3().crossVectors(camera.up, direction).normalize();
      const up = new Vector3().crossVectors(direction, right).normalize();
      const tangent = Math.tan((camera as PerspectiveCamera).fov * Math.PI / 360);
      distance = 0;
      for (const x of [-13.7, 13.7]) for (const y of [-0.9, 3.8]) for (const z of [-10, depth - 10]) {
        const corner = new Vector3(x - target[0], y - target[1], z - target[2]);
        const projected = Math.max(Math.abs(corner.dot(right)) / (tangent * aspect * 0.86), Math.abs(corner.dot(up)) / (tangent * 0.86));
        distance = Math.max(distance, corner.dot(direction) + projected);
      }
    }
    if (spot && focusX === undefined) distance = new Vector3(...offset).length();
    const position = direction.multiplyScalar(distance / command.zoom).add(new Vector3(...target));
    // The first placement and reduced motion jump; later changes fly there.
    if (animate && last) {
      flight.current = { position, target: new Vector3(...target) };
    } else {
      flight.current = null;
      camera.position.copy(position);
      controls.current.target.set(...target);
      controls.current.update();
    }
    camera.updateProjectionMatrix();
    invalidate();
    // spot is read through spotKey so an equal object does not start a new flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, aspect, command, depth, focusX, focusZ, spotKey, animate, invalidate]);
  return <OrbitControls ref={controls} makeDefault enableDamping={false} onStart={() => { flight.current = null; }} minDistance={spot ? 3 : 8} maxDistance={Math.max(100, depth * 6)} minPolarAngle={0.01} maxPolarAngle={Math.PI / 2.3} screenSpacePanning />;
}

const NO_INSET: ViewInset = { right: 0, bottom: 0 };

export default function OfficeScene({ state, selectedId, onSelect, boardLabel, command, evening = false, showNames = true, locale = "th",
  viewerId = null, petAlert = false, soundEnabled = false, reduceMotion = false, emotes = [], onEmoteDone,
  hotspots = [], onOpenSpot, focusSpot = null, inset = NO_INSET, quality = "high" }: {
  state: OfficeState; selectedId: string | null; onSelect: (id: string | null) => void; boardLabel: string;
  command: CameraCommand; evening?: boolean; showNames?: boolean; locale?: "th" | "en";
  /** The signed-in user: their pet shows the @mention alert. */
  viewerId?: string | null; petAlert?: boolean; soundEnabled?: boolean; reduceMotion?: boolean;
  emotes?: SceneEmote[]; onEmoteDone?: (id: string) => void;
  /** Objects that open pages; focusSpot is the page currently open. */
  hotspots?: SceneHotspot[]; onOpenSpot?: (key: SpotKey) => void; focusSpot?: SpotKey | null; inset?: ViewInset;
  quality?: SceneQuality;
}) {
  const high = quality === "high";
  const animate = !reduceMotion;
  const placed = useMemo(() => placePeople(state.people), [state.people]);
  const members = state.people.filter(p => p.role === "member");
  const owners = new Map(members.map(p => [p.deskIndex, p]));
  const manager = state.people.find(p => p.role === "manager");
  const director = state.people.find(p => p.role === "director");
  const depth = roomDepth(members.length);
  const focus = placed.find(p => p.person.id === selectedId)?.position ?? null;
  // The viewer's own desk is the door to their personal page.
  const viewerPerson = state.people.find(p => p.id === viewerId);
  const viewerDesk = deskOf(viewerPerson);
  const deskHotspot = hotspots.find(h => h.key === "desk");
  const spot = !focusSpot ? null
    : focusSpot === "desk" ? (viewerDesk ? { target: [viewerDesk[0], 1, viewerDesk[2]] as Vec3, offset: [3.5, 4.5, 6.5] as Vec3 } : null)
    : SPOTS[focusSpot];
  const openSpot = (key: SpotKey) => onOpenSpot?.(key);
  const placeDesk = (key: string, at: Vec3, desk: (position: Vec3) => ReactElement) =>
    deskHotspot && viewerDesk && viewerDesk[0] === at[0] && viewerDesk[2] === at[2]
      ? <DeskHotspot key={key} hotspot={deskHotspot} position={at} ring={[0, 0, 1.35]} labelY={2.2} showLabel={showNames} onOpen={openSpot}>{desk([0, 0, 0])}</DeskHotspot>
      : <group key={key}>{desk(at)}</group>;
  const [contextLost, setContextLost] = useState(false);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  if (contextLost) throw new Error("WebGL context lost");

  return <Canvas
    frameloop="demand" shadows="percentage" dpr={high ? [1, 1.75] : [1, 1.25]}
    camera={{ position: [25, 27, 32], fov: 36, near: 0.1, far: 1000 }}
    gl={{ antialias: !high, alpha: false, powerPreference: high ? "high-performance" : "low-power", stencil: false }}
    onCreated={({ gl }) => { gl.toneMappingExposure = 1; gl.domElement.addEventListener("webglcontextlost", () => setContextLost(true), { once: true }); }}
    onPointerMissed={() => onSelect(null)} aria-label={locale === "th" ? "ออฟฟิศ 3D แบบโต้ตอบ" : "Interactive 3D office"}
  >
    <CameraRig command={command} focus={focus} depth={depth} spot={spot} inset={inset} animate={!reduceMotion} />
    <Sky evening={evening} />
    <FrameDriver fps={animate ? (high ? 30 : 20) : 0} />
    {high && <Environment resolution={128} frames={1}>
      <Lightformer form="rect" intensity={evening ? 0.9 : 1.4} color={evening ? "#ffd9bd" : "#fff8ee"} position={[0, 14, 0]} rotation-x={Math.PI / 2} scale={[34, 30, 1]} />
      <Lightformer form="rect" intensity={0.8} color={evening ? "#d8c4f2" : "#cfe8ff"} position={[-22, 6, -4]} rotation-y={Math.PI / 2} scale={[24, 8, 1]} />
      <Lightformer form="rect" intensity={0.6} color={evening ? "#ffc7a0" : "#ffe8d2"} position={[22, 6, 4]} rotation-y={-Math.PI / 2} scale={[24, 8, 1]} />
    </Environment>}
    <ambientLight intensity={high ? (evening ? 0.45 : 0.5) : (evening ? 0.8 : 0.95)} color={evening ? "#e3d3f0" : "#ffffff"} />
    <directionalLight castShadow position={[-6, 18, 5]} intensity={evening ? 1.7 : 2.4} color={evening ? "#ffc58f" : "#fff7ef"} shadow-mapSize={high ? [2048, 2048] : [1024, 1024]} shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-normalBias={0.04} shadow-bias={-0.0001} />
    <directionalLight position={[12, 8, -5]} intensity={evening ? 0.7 : 1.05} color={evening ? "#d9c6f2" : "#d6ecf7"} />
    <hemisphereLight args={[evening ? "#f2d9e8" : "#eef8ff", evening ? "#c9a98c" : "#e6d6b8", high ? 0.45 : (evening ? 0.7 : 0.85)]} />
    <Architecture depth={depth} evening={evening} />
    <InteriorDetails generatedAt={state.generatedAt} evening={evening} />
    {evening && <pointLight position={[-11.7, 2.2, 3.5]} color="#ffd79a" intensity={5} distance={7} decay={2} />}
    <MeetingRoom /><Lounge /><LeaveHouse />
    <GameCorner label={showNames ? (locale === "th" ? "มุมเกม" : "GAME CORNER") : undefined} />
    <OffsiteDoor label={showNames ? (locale === "th" ? "นอกสถานที่" : "OUT OF OFFICE") : undefined} />
    {placeDesk("director", DIRECTOR_DESK, p => <Desk position={p} executive glow={WORKLOAD_COLOR[workloadLevel(director?.workload.open ?? 0)]} urgent={Boolean(director?.workload.urgent)} />)}
    {placeDesk("manager", MANAGER_DESK, p => <Desk position={p} glow={WORKLOAD_COLOR[workloadLevel(manager?.workload.open ?? 0)]} urgent={Boolean(manager?.workload.urgent)} />)}
    {Array.from({ length: Math.max(DESKS.length, members.length) }, (_, i) => {
      const owner = owners.get(i);
      return placeDesk(`desk-${i}`, deskFor(i), p => <Desk position={p} glow={WORKLOAD_COLOR[workloadLevel(owner?.workload.open ?? 0)]} urgent={Boolean(owner?.workload.urgent)} />);
    })}
    <OfficeHotspots hotspots={hotspots} showLabels={showNames} onOpen={openSpot} />
    {/* Pinboard is functional: its count comes from the authorized snapshot. */}
    <Box position={BOARD} size={[2.8, 1.5, 0.1]} color="#b69b77" round />
    <Box position={[BOARD[0], BOARD[1], BOARD[2] + 0.065]} size={[2.6, 1.3, 0.04]} color="#f0e6ca" />
    {[-0.8, 0.8].map(x => <Box key={x} position={[BOARD[0] + x, 1.55, BOARD[2] + 0.1]} size={[0.4, 0.4, 0.02]} color={x < 0 ? "#d2b4a0" : "#c1cfaf"} rotation={[0, 0, x * 0.13]} />)}
    {!hotspots.some(h => h.key === "inbox") && <Label text={boardLabel} position={[BOARD[0], 2.05, BOARD[2] + 0.15]} height={0.24} bg="rgba(0,0,0,0)" />}
    <Label text={String(state.unassignedCount)} position={[BOARD[0], 1.55, BOARD[2] + 0.16]} height={0.55} bg="rgba(0,0,0,0)" fg={state.unassignedCount ? "#ae6450" : "#4a7460"} bold />
    {showNames && <>
      <Label text={locale === "th" ? "ห้องผู้อำนวยการ" : "DIRECTOR’S OFFICE"} position={[-8.5, 0.35, -2.6]} height={0.31} fg="#526c56" />
      <Label text={locale === "th" ? "ห้องประชุม" : "MEETING ROOM"} position={[8.5, 0.35, -2.4]} height={0.31} fg="#4e777a" />
      <Label text={locale === "th" ? "พักสักนิด" : "TAKE A BREATHER"} position={[-9.1, 0.35, 7.8]} height={0.31} fg="#946c50" />
      <Label text={locale === "th" ? "ลางาน" : "ON LEAVE"} position={[9.5, 0.35, 8.3]} height={0.31} fg="#5d7750" />
    </>}
    {placed.map(({ person, position }) => <group key={person.id}>
      <Avatar appearance={person.appearance} position={position} label={person.nickname ?? person.name} selected={person.id === selectedId}
        onSelect={() => onSelect(person.id)} showName={showNames} statusBadge={person.status ? STATUS_BADGE[person.status.kind] : null}
        {...stanceFor(person, position)} animate={animate} seed={person.id} />
      {person.pet && (person.location === "desk" || person.location === "manager_desk" || person.location === "director_room") ? (
        <Pet pet={person.pet} position={[position[0] + 1.05, 0, position[2] + 0.4]} alert={petAlert && person.id === viewerId} animate={animate}
          onClick={() => { if (soundEnabled && person.pet?.sound_enabled) playPetSound(person.pet.species); }} />
      ) : null}
    </group>)}
    {emotes.map(emote => {
      // Named messages float above the sender; anonymous ones above the pinboard,
      // so an effect can never point at an anonymous author.
      const at = emote.userId ? placed.find(p => p.person.id === emote.userId)?.position : null;
      const position: Vec3 = at ? [at[0], 2.35, at[2]] : [BOARD[0], 2.6, BOARD[2] + 0.6];
      return <FloatingEmote key={emote.id} text={emote.text} position={position} reduceMotion={reduceMotion} onDone={() => onEmoteDone?.(emote.id)} />;
    })}
    {high && <Suspense fallback={null}><OfficeEffects evening={evening} /></Suspense>}
  </Canvas>;
}


