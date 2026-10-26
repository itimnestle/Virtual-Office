import type { OfficePerson } from "@/lib/office/state";
import { HAIR_COLOR, SKIN, TOP_COLOR, pick } from "@/lib/office/appearance";

export function PersonPortrait({ person, large = false }: { person: OfficePerson; large?: boolean }) {
  const a = person.appearance;
  const skin = pick(SKIN, a?.skin, "#d9a07a");
  const hair = pick(HAIR_COLOR, a?.hair_color, "#2a2522");
  const top = pick(TOP_COLOR, a?.top, "#5cc2ab");
  return <span className={`person-portrait${large ? " person-portrait-large" : ""}`}>
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M8 64c0-17 9-25 24-25s24 8 24 25" fill={top} />
      {(a?.hair === "long" || a?.hair === "bob") && <rect x="15" y="17" width="34" height={a.hair === "long" ? 34 : 27} rx="10" fill={hair} />}
      <rect x="27" y="35" width="10" height="10" rx="4" fill={skin} /><ellipse cx="32" cy="26" rx="15" ry="18" fill={skin} />
      <path d="M17 25C12 3 52 0 47 25l-6-11c-6 7-13 7-24 11Z" fill={hair} />
      {a?.hair === "bun" && <circle cx="33" cy="8" r="7" fill={hair} />}
      {a?.hair === "curly" && [18, 25, 33, 41, 47].map((x, i) => <circle key={x} cx={x} cy={15 + (i % 2) * -4} r="6" fill={hair} />)}
      <circle cx="26" cy="28" r="1.5" fill="#343b35" /><circle cx="38" cy="28" r="1.5" fill="#343b35" /><path d="M29 35q3 3 6 0" stroke="#955e4b" strokeWidth="1.5" strokeLinecap="round" />
      {a?.glasses && a.glasses !== "none" && <g stroke="#34473c" strokeWidth="1.5"><rect x="20" y="24" width="11" height="9" rx={a.glasses === "square" ? 2 : 4} /><rect x="33" y="24" width="11" height="9" rx={a.glasses === "square" ? 2 : 4} /><path d="M31 27h2" /></g>}
      {a?.accessory === "headphones" && <g stroke="#50665f" strokeWidth="4"><path d="M14 29V22a18 18 0 0 1 36 0v7" /><path d="M15 24v9m34-9v9" strokeWidth="6" /></g>}
      {(a?.accessory === "cap" || a?.accessory === "hat") && <g fill={a.accessory === "cap" ? "#6c8c79" : "#c6ad79"}><path d="M17 17C17 0 47 0 47 17" /><rect x="12" y="15" width="40" height="5" rx="2.5" /></g>}
    </svg><span className={`person-location-dot is-${person.location}`} />
  </span>;
}
