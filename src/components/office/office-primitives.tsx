"use client";

import { RoundedBox } from "@react-three/drei";

export type Vec3 = [number, number, number];

export function Box({ position, size, color, opacity, round = false, rotation }: { position: Vec3; size: Vec3; color: string; opacity?: number; round?: boolean; rotation?: Vec3 }) {
  const material = <meshStandardMaterial color={color} roughness={0.72} transparent={opacity !== undefined} opacity={opacity ?? 1} depthWrite={opacity === undefined} />;
  return round ? <RoundedBox args={size} radius={Math.min(0.12, ...size.map(v => v / 3))} smoothness={2} position={position} rotation={rotation} castShadow receiveShadow>{material}</RoundedBox> : <mesh position={position} rotation={rotation} castShadow={opacity === undefined} receiveShadow><boxGeometry args={size} />{material}</mesh>;
}

export function Cylinder({ position, radius, height, color, bottom, rotation }: { position: Vec3; radius: number; height: number; color: string; bottom?: number; rotation?: Vec3 }) {
  return <mesh position={position} rotation={rotation} castShadow receiveShadow><cylinderGeometry args={[radius, bottom ?? radius, height, 16]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>;
}


