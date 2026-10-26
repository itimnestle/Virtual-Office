/** Shared palette for the procedural 3D avatars and matching UI portraits. */
export const SKIN: Record<string, string> = {
  tone_1: "#f6d7c3",
  tone_2: "#eec1a2",
  tone_3: "#d9a07a",
  tone_4: "#b5774f",
  tone_5: "#7d4f33",
  tone_6: "#5a3825",
};

export const HAIR_COLOR: Record<string, string> = {
  black: "#2a2522",
  brown: "#6b4a2f",
  blonde: "#e2c27a",
  pink: "#f29bb5",
  blue: "#6aa6e8",
  gray: "#9aa0a6",
  red: "#b5523b",
};

export const TOP_COLOR: Record<string, string> = {
  tshirt: "#5cc2ab",
  hoodie: "#f08a5d",
  shirt: "#8fb3ff",
  blazer: "#4b5563",
  sweater: "#c792ea",
  polo: "#e7c35a",
};

export const PET_COLOR: Record<string, string> = {
  cream: "#f3e2c4",
  brown: "#9a6a43",
  black: "#333333",
  white: "#f5f5f5",
  orange: "#e58e4b",
  gray: "#8d9297",
};

export const BOTTOM_COLOR: Record<string, string> = {
  pants: "#4c5c69",
  skirt: "#85839a",
  shorts: "#7c8f7a",
  jeans: "#4a6a94",
};

export const SHOE_COLOR: Record<string, string> = {
  sneakers: "#f4efdf",
  loafers: "#7a5136",
  boots: "#3f3a36",
  sandals: "#c9a27a",
};

export const PET_OUTFIT_COLOR: Record<string, string> = {
  bandana: "#d9534f",
  bow: "#f29bb5",
  sweater: "#6aa6e8",
  raincoat: "#f2c94c",
};

export const WORKLOAD_COLOR = {
  idle: "#9ca3af",
  light: "#4ade80",
  busy: "#fbbf24",
  heavy: "#f87171",
} as const;

export function pick(map: Record<string, string>, key: string | undefined, fallback: string): string {
  return (key && map[key]) || fallback;
}
