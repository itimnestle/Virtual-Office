"use client";

/**
 * Tiny synthesized pet sounds (Web Audio, no audio files). Callers must check
 * both the viewer's sound preference and the pet's own sound setting.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

function blip(at: number, from: number, to: number, duration: number, type: OscillatorType, volume = 0.08) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, ac.currentTime + at);
  osc.frequency.exponentialRampToValueAtTime(to, ac.currentTime + at + duration);
  gain.gain.setValueAtTime(0.0001, ac.currentTime + at);
  gain.gain.exponentialRampToValueAtTime(volume, ac.currentTime + at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + at);
  osc.stop(ac.currentTime + at + duration + 0.02);
}

export function playPetSound(species: "dog" | "cat") {
  if (species === "dog") {
    blip(0, 420, 260, 0.12, "square", 0.05);
    blip(0.18, 440, 270, 0.12, "square", 0.05);
  } else {
    blip(0, 620, 880, 0.18, "sine");
    blip(0.18, 880, 520, 0.32, "sine");
  }
}

export function playChime() {
  blip(0, 880, 880, 0.12, "sine", 0.05);
  blip(0.12, 1320, 1320, 0.18, "sine", 0.05);
}
