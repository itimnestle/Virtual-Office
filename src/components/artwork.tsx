import { ARTWORK, type ArtworkName } from "@/lib/office/artwork";

export function Artwork({ name, size = 28, className }: { name: ArtworkName; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
    {ARTWORK[name].map((layer, i) => <path key={i} d={layer.d} fill={layer.fill} stroke={"stroke" in layer ? layer.stroke : undefined} strokeWidth={"width" in layer ? layer.width : undefined} />)}
  </svg>;
}
