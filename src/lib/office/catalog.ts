/**
 * Avatar / pet / chat catalogs. The database enforces the same lists
 * (supabase/migrations/20261027000001_social.sql); tests/db/social.test.ts
 * fails if the two drift apart.
 */
export const AVATAR_OPTIONS = {
  skin: ["tone_1", "tone_2", "tone_3", "tone_4", "tone_5", "tone_6"],
  face: ["round", "oval", "square", "heart"],
  eyes: ["dot", "happy", "wink", "sleepy", "sparkle"],
  nose: ["button", "small", "round", "none"],
  mouth: ["smile", "grin", "neutral", "open", "cat"],
  hair: ["short", "bob", "long", "bun", "curly", "buzz", "ponytail", "none"],
  hair_color: ["black", "brown", "blonde", "pink", "blue", "gray", "red"],
  top: ["tshirt", "hoodie", "shirt", "blazer", "sweater", "polo"],
  bottom: ["pants", "skirt", "shorts", "jeans"],
  shoes: ["sneakers", "loafers", "boots", "sandals"],
  glasses: ["none", "round", "square"],
  accessory: ["none", "headphones", "cap", "hat", "flower", "bowtie"],
} as const;

export type AvatarPart = keyof typeof AVATAR_OPTIONS;
export type AvatarValues = { [K in AvatarPart]: (typeof AVATAR_OPTIONS)[K][number] };

export const DEFAULT_AVATAR: AvatarValues = {
  skin: "tone_3",
  face: "round",
  eyes: "dot",
  nose: "button",
  mouth: "smile",
  hair: "short",
  hair_color: "black",
  top: "tshirt",
  bottom: "pants",
  shoes: "sneakers",
  glasses: "none",
  accessory: "none",
};

export const PET_BREEDS = {
  dog: ["shiba", "corgi", "poodle", "golden", "pug"],
  cat: ["scottish_fold", "siamese", "persian", "tabby", "black_cat"],
} as const;
export const PET_COLORS = ["cream", "brown", "black", "white", "orange", "gray"] as const;
export const PET_OUTFITS = ["none", "bandana", "bow", "sweater", "raincoat"] as const;

export const CHAT_STICKERS = ["cheer", "coffee", "thanks", "love", "lol", "wow", "sleepy", "party", "fighting", "ok"] as const;
export const STICKER_ART: Record<(typeof CHAT_STICKERS)[number], string> = {
  cheer: "📣",
  coffee: "☕",
  thanks: "🙏",
  love: "💖",
  lol: "🤣",
  wow: "🤩",
  sleepy: "😴",
  party: "🥳",
  fighting: "💪",
  ok: "👌",
};
export const CHAT_REACTIONS = ["👍", "❤️", "😂", "😮", "🎉", "🙏"] as const;

export function isAvatarValue<K extends AvatarPart>(part: K, value: string): value is AvatarValues[K] {
  return (AVATAR_OPTIONS[part] as readonly string[]).includes(value);
}
