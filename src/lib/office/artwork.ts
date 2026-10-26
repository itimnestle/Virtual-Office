/** Original, shared vector artwork for the DOM and the 3D canvas. */
export type ArtLayer = { d: string; fill: string; stroke?: string; width?: number };
const shape = (d: string, fill: string, stroke?: string, width = 1.6): ArtLayer => ({ d, fill, stroke, width });
const circle = (x: number, y: number, r: number) => `M${x-r} ${y}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0`;
const rect = (x: number, y: number, w: number, h: number, r = 2) => `M${x+r} ${y}h${w-r*2}q${r} 0 ${r} ${r}v${h-r*2}q0 ${r} ${-r} ${r}h${-w+r*2}q${-r} 0 ${-r} ${-r}v${-h+r*2}q0 ${-r} ${r} ${-r}Z`;
const face = [shape(circle(16,16,12), "#ffce5b"), shape("M10 14h.1m11.8 0h.1", "none", "#784e3b", 2.7), shape("M11 20q5 5 10 0", "none", "#aa6244", 1.8)];
const sun = [shape(circle(16,16,7), "#ffcb45"), shape("M16 3v3m0 20v3M3 16h3m20 0h3M6.8 6.8l2 2m14.4 14.4 2 2M6.8 25.2l2-2M23.2 8.8l2-2", "none", "#f4a62a", 2), shape("M13 16h.1m5.8 0h.1", "none", "#ad7734", 1.9), shape("M14 19q2 2 4 0", "none", "#ad7734", 1.2)];
const coffee = [shape("M7 12h16v10q0 6-8 6t-8-6Z", "#f7b66b"), shape("M23 14h2a4 4 0 0 1 0 8h-2", "none", "#df8749", 2.4), shape("M10 7q-2-2 0-4m6 4q-2-2 0-4", "none", "#bdafda", 1.8), shape("M11 17h8", "none", "#fff1d7", 2)];

export const ARTWORK = {
  lock: [shape(rect(5,13,22,17,4), "#b7a2e8"),shape("M10 13V9a6 6 0 0 1 12 0v4", "none", "#8770bc", 3),shape(circle(16,21,2.5), "#fff4df"),shape("M16 22v3", "none", "#fff4df", 2)],
  repeat: [shape("M5 12q0-6 7-6h13l-4-4m4 4-4 4M27 20q0 6-7 6H7l4 4m-4-4 4-4", "none", "#68b7c7", 3)],
  attachment: [shape("m12 21 9-9q4-4 0-7t-7 0L4 15q-6 7 1 12t12 0l10-10", "none", "#9a83d6", 3)],
  sound: [shape("M3 12h6l9-8v24l-9-8H3Z", "#81bfdc"),shape("M23 10q6 6 0 12m4-16q9 10 0 20", "none", "#ac93dc", 2)],
  home: [shape("M6 14h20v16H6Z", "#ffe1a0"),shape("m2 14 14-12 14 12", "#f38b97"),shape(rect(13,20,7,10,1), "#79bcd5"),shape(rect(8,18,4,5,1), "#b2e4ee")],
  flag: [shape("M7 3v27", "none", "#8a79b9", 2.5),shape("M8 4q6-4 11 0t10 0v14q-5 4-10 0t-11 0Z", "#7ed6ba"),shape(circle(18,10,3), "#fff0b5")],
  warning: [shape("M13 5q3-5 6 0l12 22q1 3-3 3H4q-4 0-3-3Z", "#ffcf70"),shape("M16 11v9m0 5v.1", "none", "#a67835", 2.5)],
  desk: [shape(rect(3,5,26,18,3), "#527fd0"), shape(rect(5,7,22,13,2), "#bceef3"), shape("M15 23h2v4h6v2H9v-2h6Z", "#6474b2"), shape("M9 12h5m-5 4h10", "none", "#fff", 2)],
  tasks: [shape(rect(6,5,21,25,3), "#ffd278"), shape(rect(3,3,21,25,3), "#fff7df", "#eba43a"), shape(rect(9,1,9,5,2), "#eeae49"), shape("m7 12 2 2 3-4m-5 10 2 2 3-4", "none", "#38b99a", 2), shape("M16 12h4m-4 8h4", "none", "#e2b267", 2)],
  inbox: [shape(rect(3,10,26,18,4), "#f68c76"), shape("m4 12 7-8h10l7 8", "#ffcfaa"), shape("M3 17h8l2 4h6l2-4h8", "none", "#b14b56", 1.8), shape("M12 8h8", "none", "#fff3dc", 2)],
  meetings: [shape("M3 7q0-4 4-4h16q4 0 4 4v12q0 4-4 4H12l-6 5v-5q-3 0-3-4Z", "#75b8fa"), shape("M13 10h16v16h-5l-4 4v-4h-7Z", "#b9e9ee"), shape("M8 11h11m-11 5h7", "none", "#fff", 2), shape("M18 20h7", "none", "#4d8ba8", 1.8)],
  calendar: [shape(rect(4,5,24,24,4), "#fff3ed", "#ec7e93"), shape("M4 10V8q0-3 4-3h16q4 0 4 3v4H4Z", "#f18096"), shape("M10 3v5m12-5v5", "none", "#a34f73", 2.3), shape(rect(8,16,4,4,1), "#ffc770"), shape(rect(15,16,4,4,1), "#a7c8ff"), shape(rect(22,16,3,4,1), "#a6dfd4"), shape("M9 24h3m5 0h3", "none", "#d2b9ca", 2)],
  reports: [shape(rect(3,4,26,24,4), "#ede5ff", "#ab8cde"), shape(rect(8,17,4,7,1), "#a181df"), shape(rect(14,12,4,12,1), "#66bbd7"), shape(rect(20,8,4,16,1), "#f2b858"), shape("M7 25h18", "none", "#8874bf", 1.5)],
  notifications: [shape("M7 12q0-9 9-9t9 9v8l3 4H4l3-4Z", "#ffbb62"), shape("M12 27q4 5 8 0", "none", "#c48a34", 2), shape("M11 12q0-5 4-5", "none", "#ffebba", 2.5), shape(circle(25,6,5), "#fa7e89"), shape(circle(25,6,1.5), "#fff")],
  me: [shape(circle(16,16,14), "#e7c9f6"), shape("M6 29v-4q0-8 10-8t10 8v4", "#a586df"), shape(circle(16,12,7), "#ffcfac"), shape("M9 12q-2-11 7-10 10 0 7 10l-4-6q-4 5-10 6", "#79659e"), shape("M13 13h.1m5.8 0h.1", "none", "#735565", 1.7)],
  office: [shape(rect(5,6,22,24,3), "#7bd7c3"), shape("M5 7 16 2l11 5", "#4aafad"), shape(rect(13,23,6,7,1), "#389995"), ...[9,19].flatMap(x => [12,18].map(y => shape(rect(x,y,4,3,1), "#edffef")))],
  admin: [shape(rect(5,3,22,27,3), "#9eb5d4"), ...[7,14,21].flatMap(y => [shape(rect(8,y,16,5,1), "#5b7399"),shape(circle(11,y+2.5,1), "#b8efc1")])],
  settings: [shape("m13 2 6 0 1 5 4 2 4-1 3 5-3 3v4l3 3-3 5-4-1-4 2-1 4h-6l-1-4-4-2-4 1-3-5 3-3v-4l-3-3 3-5 4 1 4-2Z", "#a9bdcf"), shape(circle(16,17,6), "#eff6ff"), shape(circle(16,17,3), "#7d96b4")],
  sun,
  cloudSun: [...sun,shape("M8 23q-2-6 4-7 4-8 10-2 8-1 8 6 0 5-5 5H12q-4 0-4-2", "#fff", "#a9d4ee", 1)],
  moon: [shape("M25 22A12 12 0 0 1 11 3a13 13 0 1 0 14 19", "#b59ce8"), shape("m24 3 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z", "#ffd878"),shape(circle(28,15,1.4), "#ffd878")],
  chat: [shape("M3 7q0-4 4-4h18q4 0 4 4v13q0 4-4 4H13l-7 5v-6q-3 0-3-4Z", "#9b88ee"), ...[10,16,22].map(x=>shape(circle(x,14,1.8), "#fff"))],
  sparkle: [shape("m17 2 4 10 9 4-9 4-4 10-4-10-10-4 10-4Z", "#ffc65e"),shape("m5 1 1.4 3.5L10 6 6.4 7.4 5 11 3.6 7.4 0 6l3.6-1.5Z", "#f39dc1")],
  smile: face,
  laugh: [face[0],shape("m9 13 4-2-4-2m14 4-4-2 4-2", "none", "#784e3b", 2),shape("M10 18h12q0 10-6 10t-6-10", "#945351"),shape("M12 24q4-3 8 0", "#f58b9e")],
  wow: [face[0],shape("m8 9 2-4 2 4 4 1-3 3v4l-3-2-3 2v-4l-3-3Zm12 0 2-4 2 4 4 1-3 3v4l-3-2-3 2v-4l-3-3Z", "#9b79ce"),shape(circle(16,23,3), "#ab6650")],
  heart: [shape("M16 29 4 17C-6 5 10-2 16 8 22-2 38 5 28 17Z", "#f287a8"),shape("M7 10q2-3 5-1", "none", "#ffd9e4", 2.5)],
  thanks: [shape("M5 29 12 9q3-5 4 0 1-5 4 0l7 20", "#ffd099", "#d5a16d"),shape("M16 9v16", "none", "#deaa72", 1.7),shape("M3 24h8v7H1Zm18 0h8l2 7H21Z", "#80baf2"),shape("M7 3 5 0m20 3 2-3", "none", "#f0bb52", 2)],
  party: [shape("m5 27 5-18 15 15Z", "#a697e9"),shape("m7 20 10 4m-8-9 12 6", "none", "#f4d27b", 2),shape("M16 9q-1-6 5-6m1 12q7 1 7-5", "none", "#ef86ad", 2.5),shape("M23 5h4m-1 14h4M9 3V0", "none", "#64c4bd", 2),shape(circle(28,3,1.5), "#ffc869")],
  coffee,
  cheer: [shape("m3 13 17-7v19L3 19Z", "#f3a3bd"),shape(rect(2,12,7,9,2), "#ba8bdb"),shape("m10 22 3 8h5l-3-10", "#9877bd"),shape("M25 9 29 6m-3 9h5m-6 6 4 3", "none", "#f5bc57", 2)],
  fighting: [shape("M9 19q-5-4-1-9l4-4 4 3-3 4q5-2 8 2 8 1 8 8 0 6-10 6H6l-3-7Z", "#ffc490"),shape("M13 15q1 5 6 5", "none", "#cf925a", 2)],
  ok: [shape("M8 17q-6-11-1-12 2-1 5 8-4-13 1-13 3 0 4 12 0-11 4-10 3 1 1 13 7-1 8 5 1 10-12 11-11 0-10-14", "#ffce99"),shape(circle(18,21,4), "#fff3dd", "#cf925a")],
  sleepy: [face[0],shape("M9 15h5m4 0h5", "none", "#876047", 2),shape(circle(16,23,2.6), "#b47657"),shape("M23 2h7l-7 6h7", "none", "#9b8cdb", 1.8)],
  focus: [shape("M5 20v-7a11 11 0 0 1 22 0v7", "none", "#9b87dc", 4),shape(rect(2,15,7,12,3), "#b5a5ec"),shape(rect(23,15,7,12,3), "#b5a5ec"),shape("M25 25q-2 5-9 4", "none", "#7e6bac", 2)],
  car: [shape("m5 15 4-9h14l4 9", "#7cc7ec"),shape(rect(2,14,28,12,4), "#62afda"),shape(rect(10,8,12,7,2), "#def5fc"),shape("M4 20h4m16 0h4", "none", "#fff4cf", 2),shape(circle(8,27,3), "#617799"),shape(circle(24,27,3), "#617799")],
  dog: [shape("M5 9 1 20q4 6 9-1m17-10 4 11q-4 6-9-1", "#bd8767"),shape("M6 12Q6 4 16 4t10 8v10q0 8-10 8T6 22Z", "#f3c799"),shape("M11 16h.1m9.8 0h.1", "none", "#71524d", 2.6),shape("M13 22q3-3 6 0l-3 3Z", "#88615a")],
  cat: [shape("m5 14 0-12 10 8 12-8v13q7 17-11 17T5 14", "#e9b67d"),shape("m8 11 0-5 5 5m8 0 4-5v5", "#ee8f9e"),shape("M10 18h.1m11.8 0h.1", "none", "#785650", 2.7),shape("m14 23 2 2 2-2M3 22h6m14 0h6", "none", "#a87258", 1.4)],
  image: [shape(rect(3,4,26,25,4), "#ccebf3", "#6db7d1"),shape("m5 26 8-11 6 7 4-5 5 9", "#72c6aa"),shape(circle(22,11,3), "#ffcd6c")],
  mask: [shape("M3 7q13-7 26 0v10q0 13-13 13T3 17Z", "#b8a3e7"),shape("M8 13q3-3 6 0m4 0q3-3 6 0M10 21q6 5 12 0", "none", "#fff4f8", 2)],
} satisfies Record<string, ArtLayer[]>;

export type ArtworkName = keyof typeof ARTWORK;
export const STICKER_ICON: Record<string, ArtworkName> = { cheer: "cheer", coffee: "coffee", thanks: "thanks", love: "heart", lol: "laugh", wow: "wow", sleepy: "sleepy", party: "party", fighting: "fighting", ok: "ok" };
const EMOTE_ICON: Record<string, ArtworkName> = { "👍": "ok", "❤️": "heart", "😂": "laugh", "😮": "wow", "🎉": "party", "🙏": "thanks", "📣": "cheer", "☕": "coffee", "💖": "heart", "🤣": "laugh", "🤩": "wow", "😴": "sleepy", "🥳": "party", "💪": "fighting", "👌": "ok", "🎧": "focus", "🚗": "car" };
export const artworkForEmote = (text: string): ArtworkName | null => EMOTE_ICON[text] ?? null;

/** Canvas uses the same path data as the SVG component, so icons match exactly. */
export function drawArtwork(ctx: CanvasRenderingContext2D, name: ArtworkName, x: number, y: number, size: number) {
  ctx.save(); ctx.translate(x,y); ctx.scale(size/32,size/32);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const layer of ARTWORK[name]) {
    const path = new Path2D(layer.d);
    if (layer.fill !== "none") { ctx.fillStyle = layer.fill; ctx.fill(path); }
    if ("stroke" in layer && layer.stroke) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = "width" in layer ? layer.width ?? 1.6 : 1.6; ctx.stroke(path); }
  }
  ctx.restore();
}
