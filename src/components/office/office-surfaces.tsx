"use client";

import { useEffect, useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { Box, Cylinder } from "./office-primitives";

/** Small local textures add detail without hundreds of tiny meshes or downloads. */
function useSurface(kind: "wood" | "keyboard") {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = kind === "wood" ? 1024 : 512;
    canvas.height = kind === "wood" ? 1024 : 160;
    const ctx = canvas.getContext("2d")!;
    if (kind === "keyboard") {
      ctx.fillStyle = "#d7ded2";
      ctx.fillRect(0, 0, 512, 160);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 14; col++) {
        ctx.fillStyle = row === 3 && col > 3 && col < 9 ? "#b6c5b4" : "#f5f3e8";
        ctx.beginPath();
        ctx.roundRect(8 + col * 35.5, 7 + row * 36, 29, 28, 4);
        ctx.fill();
      }
      ctx.fillStyle = "#eff0e6";
      ctx.fillRect(154, 116, 164, 27);
    } else {
      let seed = 913;
      const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const tones = ["#e8dfcc", "#e4dac5", "#eae1ce", "#e6ddc9"];
      for (let plank = 0; plank < 16; plank++) {
        const x = plank * 64;
        ctx.fillStyle = tones[plank % tones.length];
        ctx.fillRect(x, 0, 64, 1024);
        for (let grain = 0; grain < 14; grain++) {
          ctx.strokeStyle = `rgba(133, 108, 69, ${0.025 + random() * 0.04})`;
          ctx.lineWidth = 0.5 + random();
          const gx = x + random() * 64;
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.bezierCurveTo(gx - 4, 330, gx + 4, 660, gx, 1024);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(119, 106, 81, 0.13)";
        ctx.fillRect(x, 0, 1.2, 1024);
        for (let seam = 0; seam < 4; seam++) ctx.fillRect(x, (seam * 256 + (plank % 3) * 85) % 1024, 64, 1.3);
      }
    }
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    if (kind === "wood") { map.wrapS = map.wrapT = RepeatWrapping; map.repeat.set(2, 2); }
    map.anisotropy = 4;
    return map;
  }, [kind]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export function WoodFloor({ depth }: { depth: number }) {
  const map = useSurface("wood");
  useEffect(() => { map.repeat.set(2, depth / 10); }, [depth, map]);
  return <mesh position={[0, 0.049, (depth - 20) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={[27, depth]} /><meshStandardMaterial map={map} roughness={0.87} />
  </mesh>;
}

export function KeyboardSurface() {
  const map = useSurface("keyboard");
  return <mesh position={[-0.1, 0.972, -0.32]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={[0.6, 0.18]} /><meshStandardMaterial map={map} roughness={0.65} />
  </mesh>;
}

export function InteriorDetails({ generatedAt, evening }: { generatedAt: string; evening: boolean }) {
  const date = new Date(generatedAt);
  const minutes = date.getUTCMinutes();
  const hour = (date.getUTCHours() + 7) % 12;
  return <group>
    {/* A Bangkok clock follows the same snapshot as the people and task board. */}
    <group position={[-3.65, 2.55, -9.48]}>
      <Cylinder position={[0, 0, 0]} radius={0.39} height={0.09} color="#a28b68" rotation={[Math.PI / 2, 0, 0]} />
      <mesh position={[0, 0, 0.05]}><circleGeometry args={[0.35, 32]} /><meshStandardMaterial color="#f5efdd" /></mesh>
      {[0, 1, 2, 3].map(i => <group key={i} rotation={[0, 0, i * Math.PI / 2]}><Box position={[0, 0.28, 0.058]} size={[0.018, 0.055, 0.012]} color="#a5ad97" /></group>)}
      <group rotation={[0, 0, -(hour + minutes / 60) * Math.PI / 6]}><Box position={[0, 0.08, 0.07]} size={[0.025, 0.19, 0.012]} color="#536c57" round /></group>
      <group rotation={[0, 0, -minutes * Math.PI / 30]}><Box position={[0, 0.115, 0.08]} size={[0.018, 0.27, 0.012]} color="#536c57" round /></group>
    </group>
    {/* A compact bookcase above the executive credenza. */}
    <group position={[-10.8, 1.4, -9.02]}>
      {[-1.65, 1.65].map(x => <Box key={x} position={[x, 0.55, 0]} size={[0.08, 1.1, 0.4]} color="#b29a79" />)}
      {[0.04, 0.58, 1.1].map(y => <Box key={y} position={[0, y, 0]} size={[3.4, 0.07, 0.44]} color="#c6ac86" />)}
      {Array.from({ length: 13 }, (_, i) => <Box key={i} position={[-1.42 + i * 0.135, 0.82, 0]} size={[0.1, 0.32 + (i % 3) * 0.05, 0.27]} color={["#7b9380", "#ccab85", "#d9d6bd", "#8b9da8"][i % 4]} />)}
      <Box position={[1.1, 0.83, 0]} size={[0.54, 0.42, 0.27]} color="#ded9c5" round />
      <Box position={[1.1, 0.85, 0.145]} size={[0.18, 0.03, 0.015]} color="#acb69a" />
    </group>
    <Box position={[-10.8, 1.36, -9.0]} size={[3.25, 0.025, 0.025]} color={evening ? "#ffdb9d" : "#e4d9bb"} />
    {/* Wall-mounted acoustic slats give the lounge a distinct material. */}
    {Array.from({ length: 15 }, (_, i) => <Box key={i} position={[-13.2, 1.72, 4.8 + i * 0.12]} size={[0.07, 1.6, 0.055]} color={i % 2 ? "#b6a380" : "#c9b694"} />)}
    <group position={[12.75, 0.1, 4.7]}>
      <Box position={[0, 0.3, 0]} size={[0.8, 0.6, 2.4]} color="#c2b194" round />
      <Box position={[0, 0.61, 0]} size={[0.67, 0.025, 2.25]} color="#8f9270" />
      {[-0.8, 0, 0.8].map(z => <mesh key={z} position={[0, 1, z]} scale={[0.35, 0.55, 0.4]} castShadow><icosahedronGeometry args={[0.65, 1]} /><meshStandardMaterial color={z ? "#748e65" : "#94a478"} roughness={0.9} /></mesh>)}
    </group>
    {/* The floor receives a soft grounding shadow beneath the diorama. */}
    <mesh position={[0, -0.81, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[150, 150]} /><shadowMaterial opacity={evening ? 0.16 : 0.09} /></mesh>
  </group>;
}

