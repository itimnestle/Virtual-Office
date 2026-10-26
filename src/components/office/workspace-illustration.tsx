/** Lightweight vector companion to the interactive office; no WebGL on auth pages. */
export function WorkspaceIllustration() {
  return <svg className="workspace-illustration" viewBox="0 0 640 440" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="office-floor" x1="140" y1="190" x2="500" y2="370" gradientUnits="userSpaceOnUse"><stop stopColor="#eee8d7" /><stop offset="1" stopColor="#dfd8c2" /></linearGradient>
      <linearGradient id="office-window" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#c7dcd3" /><stop offset="1" stopColor="#e3ebe0" /></linearGradient>
      <filter id="office-shadow" x="0" y="0" width="640" height="440" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="15" /></filter>
      <g id="office-desk">
        <path d="m-48 6 53 31 56-32L8-26-48 6Z" fill="#c5aa83" />
        <path d="m-48 6 53 31v7l-53-31V6Z" fill="#b6956d" /><path d="M5 37 61 5v7L5 44v-7Z" fill="#a58965" />
        <path d="M-39 17v34l5 3V20l-5-3Zm81 4v34l5-3V18l-5 3ZM1 42v34l5 3V45l-5-3Z" fill="#7a8973" />
        <path d="m-20-6 25 14V-14l-25-14v22Z" fill="#354c42" /><path d="m-17-9 19 11v-14l-19-11v14Z" fill="#a7c5b4" /><path d="m5 8 25-14v-22L5-14V8Z" fill="#486154" /><path d="m8 2 19-11v-14L8-12V2Z" fill="#b5d0bc" />
        <path d="M5 8v9m-5 3 12-7" stroke="#405b4a" strokeWidth="3" strokeLinecap="round" />
        <path d="m-17 14 17 10 16-9L-1 5l-16 9Z" fill="#e9e5d3" />
        <ellipse cx="37" cy="8" rx="5" ry="3" fill="#f7efdc" /><path d="M32 8v8c0 4 10 4 10 0V8" fill="#f7efdc" />
      </g>
      <g id="office-plant"><path d="m-12 0 3 25c2 6 16 6 18 0l3-25" fill="#d0b895" /><ellipse cy="1" rx="12" ry="6" fill="#9c9573" /><path d="M0 3v-45" stroke="#688360" strokeWidth="3" /><ellipse cx="-9" cy="-18" rx="8" ry="18" transform="rotate(-35 -9 -18)" fill="#8ba17b" /><ellipse cx="9" cy="-31" rx="8" ry="19" transform="rotate(30 9 -31)" fill="#6e8d65" /><ellipse cx="-4" cy="-40" rx="7" ry="17" transform="rotate(-15 -4 -40)" fill="#9aaf84" /></g>
      <g id="office-person"><path d="M-9 26V8C-9-6 9-6 9 8v18" fill="#b98062" /><ellipse cy="-8" rx="10" ry="12" fill="#dfb38b" /><path d="M-10-9c-3-18 25-17 20 0-6 1-9-3-11-7-1 5-5 6-9 7Z" fill="#5b5040" /><path d="M-5 26v11m10-11v11" stroke="#516453" strokeWidth="6" strokeLinecap="round" /></g>
    </defs>
    <ellipse cx="329" cy="349" rx="232" ry="35" fill="#456045" opacity=".12" filter="url(#office-shadow)" />
    <path d="m64 216 246-142 272 157-246 142L64 216Z" fill="url(#office-floor)" />
    <path d="m64 216 272 157v14L64 230v-14Z" fill="#c2bfa7" /><path d="m336 373 246-142v14L336 387v-14Z" fill="#b2b79c" />
    <path d="m64 216 246-142V-3L64 139v77Z" fill="#d5ddc6" /><path d="m310 74 272 157v-77L310-3v77Z" fill="#e4e6d4" />
    {[0, 1, 2, 3].map(i => <g key={i} transform={`translate(${341 + i * 55} ${48 + i * 32})`}><path d="m0 0 41 24v43L0 43V0Z" fill="#a8bda5" /><path d="m3 6 35 20v35L3 41V6Z" fill="url(#office-window)" /><path d="m20 16 0 37" stroke="#f4f0dd" strokeWidth="2" /></g>)}
    {[0, 1, 2].map(i => <path key={i} d={`m${107 + i * 62} ${144 - i * 36} 30-17v35l-30 17v-35Z`} fill={i % 2 ? "#b9b991" : "#f0e7d1"} stroke="#a8b397" strokeWidth="3" />)}
    <path d="m102 230 84-48 66 38-84 49-66-39Z" fill="#c5b28f" />
    <path d="m123 210 39-23 12 7-39 23-12-7Z" fill="#cf9574" /><path d="m123 210 12 7v26l-12-7v-26Z" fill="#ba8164" /><path d="m135 217 39-23v26l-39 23v-26Z" fill="#d7a685" />
    <path d="m135 235 39-23 25 14-39 23-25-14Z" fill="#e1b798" /><path d="m160 249 39-23v10l-39 23v-10Z" fill="#c89573" />
    <use href="#office-plant" transform="translate(95 211) scale(.8)" /><use href="#office-plant" transform="translate(539 236) scale(1.1)" />
    <path d="m242 177 113-65 117 68-113 65-117-68Z" fill="#bfcdb7" opacity=".7" />
    <use href="#office-desk" transform="translate(307 164) scale(.8)" /><use href="#office-person" transform="translate(303 142) scale(.8)" />
    <use href="#office-desk" transform="translate(402 217) scale(.8)" /><use href="#office-person" transform="translate(398 195) scale(.8)" />
    <use href="#office-desk" transform="translate(241 231) scale(.8)" /><use href="#office-person" transform="translate(237 209) scale(.8)" />
    <use href="#office-desk" transform="translate(337 286) scale(.8)" /><use href="#office-person" transform="translate(333 264) scale(.8)" />
    <use href="#office-plant" transform="translate(437 285) scale(.65)" /><use href="#office-plant" transform="translate(256 330) scale(.7)" />
    <path d="m477 100 10 6v-12l-10-6v12Z" fill="#bdc8a5" />
    <path d="M62 65v18m-9-9h18m491 239v12m-6-6h12" stroke="#9aa987" strokeWidth="2" strokeLinecap="round" />
    <circle cx="578" cy="86" r="4" fill="#c8b291" /><circle cx="74" cy="315" r="3" fill="#acb99b" />
  </svg>;
}
