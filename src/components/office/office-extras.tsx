"use client";

import { Box, Cylinder, type Vec3 } from "./office-furniture";
import { Label } from "./office-avatar";

/** A miniature arcade and foosball table built from local geometry. */
export function GameCorner({ label }: { label?: string }) {
  return (
    <group>
      <group position={[-6.2, 0, 8.5]}>
        <Box position={[0, 0.85, 0]} size={[0.9, 1.7, 0.75]} color="#a486d9" round />
        <Box position={[0, 1.35, 0.39]} size={[0.66, 0.5, 0.03]} color="#1f2a44" />
        <Box position={[0, 1.35, 0.405]} size={[0.56, 0.4, 0.01]} color="#233d38" />
        {Array.from({ length: 12 }, (_, i) => <Box key={i} position={[-0.2 + (i % 4) * 0.13, 1.45 - Math.floor(i / 4) * 0.065, 0.416]} size={[0.06, 0.033, 0.009]} color={i % 3 ? "#c3d6a0" : "#e8b787"} />)}
        <Box position={[0.04, 1.21, 0.416]} size={[0.12, 0.025, 0.008]} color="#e6bd8a" />
        <Box position={[0, 0.95, 0.3]} size={[0.8, 0.12, 0.35]} color="#7a64b8" rotation={[-0.4, 0, 0]} />
        {[-0.18, 0.18].map((x) => (
          <Cylinder key={x} position={[x, 1.04, 0.36]} radius={0.04} height={0.05} color={x < 0 ? "#f08a5d" : "#f2c94c"} />
        ))}
        <Cylinder position={[-0.22, 1.09, 0.45]} radius={0.022} height={0.13} color="#c6ccc0" />
        <mesh position={[-0.22, 1.17, 0.45]}><sphereGeometry args={[0.055, 8, 6]} /><meshStandardMaterial color="#c58d6c" /></mesh>
        <Box position={[0, 1.78, 0.2]} size={[0.92, 0.18, 0.4]} color="#ffcc72" round />
        <Box position={[0, 1.78, 0.407]} size={[0.67, 0.075, 0.015]} color="#f5e6bd" round />
        <Box position={[0, 0.55, 0.385]} size={[0.25, 0.28, 0.02]} color="#40594e" round />
        <Box position={[0, 0.62, 0.4]} size={[0.11, 0.025, 0.01]} color="#a7b6a3" />
        <Box position={[0, 0.09, 0.39]} size={[0.72, 0.07, 0.04]} color="#7a64b8" />
      </group>
      <group position={[-3.4, 0, 8.4]}>
        <Box position={[0, 0.78, 0]} size={[1.6, 0.18, 0.95]} color="#7c5a3c" round />
        <Box position={[0, 0.88, 0]} size={[1.45, 0.02, 0.8]} color="#6fae6b" />
        {[-0.48, 0.48].map(z => <Box key={z} position={[0, 0.96, z]} size={[1.65, 0.2, 0.07]} color="#b9986b" />)}
        {[-0.8, 0.8].map(x => <Box key={x} position={[x, 0.96, 0]} size={[0.07, 0.2, 0.95]} color="#b9986b" />)}
        <Box position={[0, 0.897, 0]} size={[0.018, 0.005, 0.78]} color="#d6e5b5" />
        <mesh position={[0, 0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.16, 0.172, 24]} /><meshStandardMaterial color="#d6e5b5" /></mesh>
        {[-0.6, -0.2, 0.2, 0.6].map((x) => (
          <group key={x}>
            <Box position={[x, 0.99, 0]} size={[0.025, 0.025, 1.48]} color="#c9ced3" />
            <Box position={[x, 0.99, x < 0 ? -0.77 : 0.77]} size={[0.06, 0.06, 0.2]} color="#4d5a4e" round />
            {[-0.23, 0, 0.23].map(z => <group key={z}><Box position={[x, 0.98, z]} size={[0.055, 0.14, 0.065]} color={x < 0 ? "#d8bd8d" : "#5fa8db"} /><mesh position={[x, 1.08, z]}><sphereGeometry args={[0.04, 6, 5]} /><meshStandardMaterial color="#d8c7a3" /></mesh></group>)}
          </group>
        ))}
        <mesh position={[0.1, 0.93, 0.15]} castShadow><sphereGeometry args={[0.035, 8, 6]} /><meshStandardMaterial color="#f4efda" /></mesh>
        {[-0.7, 0.7].flatMap((x) => [-0.4, 0.4].map((z) => <Box key={`${x}${z}`} position={[x, 0.35, z]} size={[0.1, 0.7, 0.1]} color="#5a4230" />))}
      </group>
      {label ? <Label text={label} position={[-4.8, 0.35, 9.6]} height={0.31} fg="#6c5aa8" /> : null}
    </group>
  );
}

/** Doorway on the open right side where "out of office" people wait. */
export function OffsiteDoor({ label }: { label?: string }) {
  const at: Vec3 = [13.3, 0, -1.2];
  return (
    <group position={at}>
      <Box position={[0, 1.2, -0.75]} size={[0.18, 2.4, 0.18]} color="#8a9a8f" />
      <Box position={[0, 1.2, 0.75]} size={[0.18, 2.4, 0.18]} color="#8a9a8f" />
      <Box position={[0, 2.45, 0]} size={[0.2, 0.18, 1.7]} color="#8a9a8f" />
      <Box position={[0, 2.75, 0]} size={[0.08, 0.36, 1.4]} color="#3f7d5a" />
      <Box position={[0, 0.03, 0]} size={[1.6, 0.04, 1.6]} color="#c9c1ad" />
      {label ? <Label text={label} position={[-0.4, 3.25, 0]} height={0.3} bg="#3f7d5a" fg="#ffffff" bold /> : null}
    </group>
  );
}

export { LOUNGE_SPOTS, offsiteSpot } from "@/lib/office/layout";
