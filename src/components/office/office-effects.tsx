"use client";

import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

/**
 * "Best visuals" post-processing: ambient occlusion, soft bloom, neutral tone
 * mapping (keeps whites white), anti-aliasing and a light vignette. Loaded on
 * demand so the battery-saver mode never downloads it.
 */
export default function OfficeEffects({ evening }: { evening: boolean }) {
  return <EffectComposer multisampling={0} enableNormalPass={false}>
    <N8AO halfRes aoRadius={0.9} distanceFalloff={0.6} intensity={2.4} color={evening ? "#4a3a5c" : "#3d4a52"} />
    <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.35} />
    <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    <SMAA />
    <Vignette offset={0.3} darkness={0.28} />
  </EffectComposer>;
}
