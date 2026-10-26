"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Avatar, Pet } from "./office-avatar";
import type { Appearance, PetInfo } from "@/lib/office/state";

/** Small on-demand 3D preview of the same avatar/pet models used in the office. */
export default function CharacterPreview({ appearance, pet, label }: { appearance: Appearance; pet: PetInfo | null; label: string }) {
  return (
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [0, 1.4, 3.4], fov: 35 }} gl={{ antialias: true, alpha: true }} aria-label={label}>
      <ambientLight intensity={1.15} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} />
      <hemisphereLight args={["#ffffff", "#d8ccb6", 0.5]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[1.6, 32]} />
        <meshStandardMaterial color="#e9e3d5" />
      </mesh>
      <Avatar appearance={appearance} position={[-0.35, 0, 0]} />
      {pet ? <Pet pet={pet} position={[0.75, 0, 0.35]} /> : null}
      <OrbitControls target={[0.1, 0.8, 0]} enablePan={false} minDistance={2.2} maxDistance={6} maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
  );
}
