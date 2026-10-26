"use client";

import { Box, Cylinder, type Vec3 } from "./office-primitives";
import { KeyboardSurface, WoodFloor } from "./office-surfaces";
export { Box, Cylinder, type Vec3 } from "./office-primitives";



export function Plant({ position, scale = 1, pot = "#f4b982" }: { position: Vec3; scale?: number; pot?: string }) {
  return <group position={position} scale={scale}>
    <Cylinder position={[0, 0.24, 0]} radius={0.27} bottom={0.2} height={0.48} color={pot} />
    <Cylinder position={[0, 0.48, 0]} radius={0.245} height={0.025} color="#534638" />
    <Cylinder position={[0, 0.79, 0]} radius={0.025} height={0.7} color="#5d7150" />
    {Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[Math.cos(i * 2.4) * 0.21, 0.7 + i * 0.09, Math.sin(i * 2.4) * 0.21]} rotation={[0.35, i * 2.4, -0.6]} scale={[0.23, 0.4, 0.12]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={i % 2 ? "#55bf89" : "#278e71"} roughness={0.9} /></mesh>)}
  </group>;
}

export function Chair({ position, rotation = 0, color = "#76b8ee" }: { position: Vec3; rotation?: number; color?: string }) {
  return <group position={position} rotation={[0, rotation, 0]}>
    <Box position={[0, 0.46, 0]} size={[0.68, 0.15, 0.66]} color={color} round />
    <Box position={[0, 0.85, -0.29]} size={[0.68, 0.7, 0.13]} color={color} round />
    <Cylinder position={[0, 0.23, 0]} radius={0.055} height={0.4} color="#414c4a" />
    {[0, Math.PI / 3, -Math.PI / 3].map(r => <Box key={r} position={[0, 0.07, 0]} size={[0.74, 0.06, 0.06]} color="#414c4a" rotation={[0, r, 0]} />)}
    {[-0.4, 0.4].map(x => <Box key={x} position={[x, 0.67, 0]} size={[0.065, 0.07, 0.45]} color="#414c4a" round />)}
  </group>;
}

export function Mug({ position, color = "#f6f3ea" }: { position: Vec3; color?: string }) {
  return <group position={position}>
    <Cylinder position={[0, 0.09, 0]} radius={0.08} height={0.18} color={color} />
    <Cylinder position={[0, 0.183, 0]} radius={0.065} height={0.005} color="#594639" />
    <mesh position={[0.085, 0.1, 0]}><torusGeometry args={[0.055, 0.017, 5, 10]} /><meshStandardMaterial color={color} /></mesh>
  </group>;
}

export function Desk({ position, glow, urgent, executive = false }: { position: Vec3; glow: string; urgent: boolean; executive?: boolean }) {
  const accent = executive ? "#a993e5" : ["#76b8ee", "#7bd5c0", "#f3a5ba"][Math.abs(Math.round(position[0] * 2 + position[2])) % 3];
  return <group position={position}>
    <Box position={[0, 0.83, 0]} size={[2.15, 0.13, 1.12]} color={executive ? "#ad805a" : "#dec4a3"} round />
    {[-0.89, 0.89].map(x => <Box key={x} position={[x, 0.4, 0]} size={[0.09, 0.8, 0.88]} color="#5d6862" />)}
    <Box position={[0, 0.92, -0.2]} size={[1.35, 0.025, 0.48]} color={accent} round />
    {[-0.4, 0.4].map((x, i) => <group key={x} rotation={[0, i ? -0.1 : 0.1, 0]}>
      <Box position={[x, 1.3, 0.2]} size={[0.73, 0.48, 0.065]} color="#344440" round />
      <Box position={[x, 1.31, 0.162]} size={[0.65, 0.39, 0.008]} color={i ? "#bfd3d2" : "#a5c3bd"} />
      <Box position={[x - 0.19, 1.31, 0.154]} size={[0.15, 0.29, 0.008]} color="#53766e" />
      {[0, 1, 2].map(line => <Box key={line} position={[x + 0.07, 1.4 - line * 0.09, 0.15]} size={[0.29 - line * 0.05, 0.025, 0.009]} color="#edf2e9" />)}
      <Box position={[x, 1.02, 0.22]} size={[0.05, 0.25, 0.05]} color="#344440" />
      <Box position={[x, 0.92, 0.2]} size={[0.33, 0.025, 0.22]} color="#344440" round />
      <Box position={[x, 1.3, 0.238]} size={[0.17, 0.06, 0.01]} color="#718c80" round />
    </group>)}
    <Box position={[-0.1, 0.952, -0.32]} size={[0.62, 0.035, 0.19]} color="#ecece1" round />
    <KeyboardSurface />
    <Box position={[0.4, 0.95, -0.32]} size={[0.1, 0.045, 0.15]} color="#edece3" round />
    <Mug position={[-0.88, 0.9, -0.3]} color={executive ? "#e7d5b7" : "#f1ece3"} />
    <Plant position={[0.89, 0.91, 0.28]} scale={0.27} />
    <Box position={[0.82, 0.92, -0.34]} size={[0.22, 0.025, 0.27]} color="#d3a071" rotation={[0, -0.12, 0]} />
    <mesh position={[0, 1.59, 0.2]}><sphereGeometry args={[0.065, 10, 8]} /><meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={0.7} /></mesh>
    {urgent && <mesh position={[0.94, 1.3, 0.05]} rotation={[0, 0, Math.PI]}><coneGeometry args={[0.1, 0.24, 4]} /><meshStandardMaterial color="#e57d6f" emissive="#e57d6f" emissiveIntensity={0.25} /></mesh>}
    <group position={[0, 0, -1]} scale={[1, 1.28, 1]}><Chair position={[0, 0, 0]} color={accent} /></group>
    <Box position={[0.78, 0.34, 0.03]} size={[0.45, 0.64, 0.62]} color="#e9e3d6" round />
    {[0.22, 0.45].map(y => <Box key={y} position={[0.78, y, -0.29]} size={[0.17, 0.025, 0.025]} color="#959d8e" />)}
  </group>;
}

function Books({ position }: { position: Vec3 }) {
  return <group position={position}>{["#9baf9c", "#d2a381", "#e2d6bd", "#8a9fa6", "#ad8f8e"].map((c, i) => <Box key={c} position={[i * 0.13, 0.2, 0]} size={[0.1, 0.34 + (i % 2) * 0.08, 0.25]} color={c} />)}</group>;
}

export function Architecture({ depth = 20, evening }: { depth?: number; evening: boolean }) {
  const centerZ = (depth - 20) / 2;
  return <group>
    <Box position={[0, -0.4, centerZ]} size={[27.3, 0.75, depth + 0.3]} color="#a995d5" round />
    <Box position={[0, 0, centerZ]} size={[27, 0.09, depth]} color="#e9e3d5" />
    <WoodFloor depth={depth} />
    <Box position={[0, 1.7, -9.85]} size={[27, 3.4, 0.22]} color="#cbb3f0" />
    <Box position={[-13.4, 1.7, centerZ]} size={[0.2, 3.4, depth]} color="#a9e2d8" />
    <Box position={[0, 0.15, -9.68]} size={[27, 0.22, 0.12]} color="#83b9b5" />
    <Box position={[-13.25, 0.15, centerZ]} size={[0.12, 0.22, depth]} color="#83b9b5" />
    {/* Inset windows have opaque sky panels, so they need no remote environment. */}
    {[-9.8, -5.7, -1.6, 2.5, 6.6, 10.7].map(x => <group key={x}>
      <Box position={[x, 2, -9.67]} size={[3.3, 1.9, 0.09]} color="#83b7d8" round />
      <Box position={[x, 2, -9.61]} size={[3.1, 1.72, 0.03]} color={evening ? "#d8b5e9" : "#b2e4ff"} />
      <Box position={[x, 2, -9.56]} size={[0.06, 1.75, 0.04]} color="#f7f4e8" />
      <Box position={[x, 1.75, -9.56]} size={[3.12, 0.06, 0.04]} color="#f7f4e8" />
      <Box position={[x, 1.08, -9.47]} size={[3.5, 0.1, 0.38]} color="#e5d8bf" round />
    </group>)}
    {[-6, -1, 4].map(z => <group key={z}>
      <Box position={[-13.23, 1.9, z]} size={[0.08, 1.4, 1.1]} color="#d2b493" />
      <Box position={[-13.17, 1.9, z]} size={[0.03, 1.22, 0.93]} color="#f6f0df" />
      <mesh position={[-13.13, 1.95, z]} rotation={[0, Math.PI / 2, 0]}><circleGeometry args={[0.32, 24]} /><meshStandardMaterial color={z === -1 ? "#f9c25c" : "#ef91b0"} /></mesh>
    </group>)}
    <Box position={[-8.5, 0.07, -5.8]} size={[7.7, 0.035, 6]} color="#c3a5ed" round />
    <Box position={[8, 0.07, -5.6]} size={[7.8, 0.035, 6.3]} color="#91cef1" round />
    <Box position={[-8.8, 0.07, 4.5]} size={[6.9, 0.035, 6]} color="#ffbd8b" round />
    <Box position={[9.5, 0.07, 5.3]} size={[5.6, 0.035, 5.8]} color="#b7df91" round />
    {/* Glass dividers with posts, sills, and a clear entrance. */}
    {[-5, 4.2].map(x => <group key={x}>
      <Box position={[x, 1.1, -6]} size={[0.05, 2.2, 6.4]} color="#a7c9c8" opacity={0.18} />
      {[-9.2, -6, -2.8].map(z => <Box key={z} position={[x, 1.15, z]} size={[0.065, 2.3, 0.065]} color="#5d9da7" />)}
      <Box position={[x, 2.3, -6]} size={[0.07, 0.07, 6.5]} color="#5d9da7" />
      <Box position={[x, 0.2, -6]} size={[0.07, 0.08, 6.5]} color="#5d9da7" />
    </group>)}
    {[-9.5, 9.7].map(x => <group key={x}>
      <Box position={[x, 1.1, -2.8]} size={[4.9, 2.2, 0.05]} color="#a7c9c8" opacity={0.17} />
      <Box position={[x, 2.3, -2.8]} size={[5, 0.07, 0.07]} color="#5d9da7" />
      {[x - 2.45, x + 2.45].map(px => <Box key={px} position={[px, 1.15, -2.8]} size={[0.06, 2.3, 0.06]} color="#5d9da7" />)}
    </group>)}
    <Box position={[-10.8, 0.65, -8.8]} size={[3.4, 1.3, 0.65]} color="#b29a79" round />
    <Box position={[-10.8, 1.32, -8.8]} size={[3.5, 0.08, 0.72]} color="#e4d8bd" />
    <Books position={[-11.8, 1.36, -8.8]} /><Plant position={[-9.5, 1.36, -8.8]} scale={0.48} />
    {[[12.4, 0.1, -8.6], [-12.2, 0.1, -2.4], [3.6, 0.1, -2], [-4.3, 0.1, 6.5], [12, 0.1, 1.4]].map((p, i) => <Plant key={i} position={p as Vec3} scale={i % 2 ? 1.1 : 1.35} pot={i % 2 ? "#f5ad99" : "#fbf1d6"} />)}
    <group position={[-11.7, 0, 3.5]}>
      <Cylinder position={[0, 0.08, 0]} radius={0.32} height={0.12} color="#6a7468" />
      <Cylinder position={[0, 1.3, 0]} radius={0.025} height={2.6} color="#6a7468" />
      <mesh position={[0, 2.6, 0]} castShadow><coneGeometry args={[0.46, 0.4, 24, 1, true]} /><meshStandardMaterial color="#ddd1ac" side={2} /></mesh>
      <mesh position={[0, 2.41, 0]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.43, 24]} /><meshStandardMaterial color="#fff2cf" emissive="#ffe0a1" emissiveIntensity={evening ? 1.2 : 0.3} side={2} /></mesh>
    </group>
  </group>;
}

export function MeetingRoom() {
  return <group position={[8, 0, -5.8]}>
    <Box position={[0, 0.86, 0]} size={[3.7, 0.16, 1.55]} color="#d7b98f" round />
    {[-1.2, 1.2].map(x => <Box key={x} position={[x, 0.43, 0]} size={[0.16, 0.86, 1]} color="#536d62" />)}
    {[-1.25, 0, 1.25].map(x => <group key={x}><Chair position={[x, 0, -1.3]} color="#6ab7e8" /><Chair position={[x, 0, 1.3]} rotation={Math.PI} color="#6ab7e8" /></group>)}
    <Box position={[-0.6, 0.96, 0]} size={[0.52, 0.03, 0.35]} color="#f3eddf" rotation={[0, 0.2, 0]} />
    <Mug position={[0.6, 0.95, 0.15]} /><Plant position={[1.4, 0.95, 0]} scale={0.25} />
    <Box position={[0, 2.1, -3.6]} size={[2.9, 1.45, 0.1]} color="#3d5351" round />
    <Box position={[0, 2.1, -3.53]} size={[2.65, 1.22, 0.02]} color="#6b9490" />
    {[0, 1, 2, 3].map(i => <Box key={i} position={[-0.83 + i * 0.55, 1.85 + i * 0.12, -3.5]} size={[0.32, 0.3 + i * 0.24, 0.025]} color={i % 2 ? "#d4dfc0" : "#b2cebf"} />)}
  </group>;
}

export function Lounge() {
  return <group position={[-9, 0, 4.5]}>
    <Box position={[-1.3, 0.28, -0.9]} size={[2.6, 0.5, 1.15]} color="#ed7791" round />
    <Box position={[-1.3, 0.76, -1.35]} size={[2.6, 0.9, 0.28]} color="#f18b9f" round />
    {[-2.55, -0.05].map(x => <Box key={x} position={[x, 0.62, -0.9]} size={[0.24, 0.65, 1.16]} color="#f18b9f" round />)}
    {[-1.9, -0.75].map(x => <Box key={x} position={[x, 0.59, -0.9]} size={[1.08, 0.16, 0.83]} color="#ffb1b9" round />)}
    <Box position={[-2, 0.92, -1.08]} size={[0.48, 0.45, 0.2]} color="#ffd876" round rotation={[0, 0.1, -0.18]} />
    <Cylinder position={[-0.5, 0.48, 1]} radius={0.85} height={0.13} color="#e4d1b2" />
    <Cylinder position={[-0.5, 0.23, 1]} radius={0.27} height={0.45} color="#ab8d6b" />
    <Mug position={[-0.8, 0.56, 1]} /><Box position={[-0.2, 0.57, 1]} size={[0.35, 0.035, 0.5]} color="#7e9a8b" rotation={[0, 0.3, 0]} />
    <Cylinder position={[1.4, 0.3, 1.7]} radius={0.55} height={0.6} color="#a58be0" />
    <Cylinder position={[1.4, 0.63, 1.7]} radius={0.56} height={0.12} color="#c4adf1" />
    <Box position={[2, 0.55, -1.8]} size={[1.35, 1.1, 0.6]} color="#b5a184" round />
    <Box position={[2, 1.13, -1.8]} size={[1.45, 0.08, 0.7]} color="#e9dfcb" round />
    <Box position={[1.8, 1.45, -1.8]} size={[0.55, 0.55, 0.45]} color="#9c80d4" round />
    <Box position={[1.8, 1.45, -1.56]} size={[0.32, 0.27, 0.02]} color="#d4b8fa" />
    <Mug position={[2.4, 1.17, -1.8]} />
    <Plant position={[-2.5, 0.1, 2]} scale={1.2} />
  </group>;
}

export function LeaveHouse() {
  return <group position={[9.4, 0.1, 4.7]}>
    <Box position={[0, 0.8, 0]} size={[2.4, 1.6, 1.9]} color="#fff1ba" round />
    <mesh position={[0, 2.02, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[1.95, 1, 4]} /><meshStandardMaterial color="#f37e78" roughness={0.85} /></mesh>
    <Box position={[0, 0.55, 0.97]} size={[0.55, 1.1, 0.06]} color="#69b7c8" round />
    <mesh position={[0.17, 0.54, 1.02]}><sphereGeometry args={[0.035, 8, 6]} /><meshStandardMaterial color="#d7b777" /></mesh>
    {[-0.8, 0.8].map(x => <group key={x}><Box position={[x, 1.05, 0.97]} size={[0.49, 0.55, 0.06]} color="#a8c5c1" /><Box position={[x, 1.05, 1.01]} size={[0.04, 0.55, 0.03]} color="#faf0dc" /><Box position={[x, 1.05, 1.01]} size={[0.49, 0.04, 0.03]} color="#faf0dc" /></group>)}
    <Box position={[0.75, 2.15, -0.45]} size={[0.34, 0.95, 0.35]} color="#c9a381" />
    <Box position={[0, 0.03, 1.25]} size={[0.9, 0.06, 0.4]} color="#d2c0a1" round />
    <Plant position={[-1.7, 0, 0.5]} scale={0.65} />
  </group>;
}


