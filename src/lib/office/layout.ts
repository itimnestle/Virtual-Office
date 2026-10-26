import type { OfficePerson } from "./state";
import type { SpotKey } from "./destinations";

/**
 * Floor plan of the office in scene units (metres). Pure data, shared by the
 * 3D scene and the 2D minimap so both always agree on where things are.
 * The room spans x −13.7…13.7 and z −10…(depth − 10).
 */
export type Vec3 = [number, number, number];

export const DESKS: Vec3[] = [
  [-3, 0, 0.5],
  [0, 0, 0.5],
  [3, 0, 0.5],
  [6, 0, 0.5],
  [-1.5, 0, 4],
  [1.5, 0, 4],
  [4.5, 0, 4],
];
export const MANAGER_DESK: Vec3 = [-1, 0, -4.5];
export const DIRECTOR_DESK: Vec3 = [-8.5, 0, -5.5];
export const MEETING_TABLE: Vec3 = [8, 0, -5.8];
export const HOME: Vec3 = [9.5, 0, 5];
export const BOARD: Vec3 = [2.5, 1.7, -8.3];

export const LOUNGE_SPOTS: Vec3[] = [
  [-10.6, 0, 6.2],
  [-7.1, 0, 6.2],
  [-9.0, 0, 3.0],
  [-6.6, 0, 3.6],
  [-11.4, 0, 3.4],
  [-5.4, 0, 9.4],
  [-3.4, 0, 9.5],
  [-2.2, 0, 8.4],
];

export function offsiteSpot(index: number): Vec3 {
  return [12.2 - (index % 2) * 0.95, 0, -2.1 + Math.floor(index / 2) * 1.05];
}

export function deskFor(index: number): Vec3 {
  if (index < DESKS.length) return DESKS[index];
  const extra = index - DESKS.length; // more members than desks: extra row
  return [-4.5 + (extra % 5) * 3, 0, 7.5 + Math.floor(extra / 5) * 3];
}

export function roomDepth(memberCount: number) {
  return Math.max(20, memberCount > 7 ? 20 + Math.ceil((memberCount - 7) / 5) * 3 : 20);
}

export function positionFor(person: OfficePerson, indexInGroup: number, groupSize: number): Vec3 {
  switch (person.location) {
    case "home": {
      const a = (indexInGroup / Math.max(groupSize, 1)) * Math.PI * 2;
      return [HOME[0] + Math.cos(a) * 1.6, 0, HOME[2] + 1.9 + Math.sin(a) * 0.5];
    }
    case "meeting": {
      const a = (indexInGroup / Math.max(groupSize, 1)) * Math.PI * 2;
      return [MEETING_TABLE[0] + Math.cos(a) * 2.35, 0, MEETING_TABLE[2] + Math.sin(a) * 1.6];
    }
    case "lounge":
      return LOUNGE_SPOTS[indexInGroup % LOUNGE_SPOTS.length];
    case "offsite":
      return offsiteSpot(indexInGroup);
    case "director_room":
      return [DIRECTOR_DESK[0], 0, DIRECTOR_DESK[2] - 0.85];
    case "manager_desk":
      return [MANAGER_DESK[0], 0, MANAGER_DESK[2] - 0.85];
    default: {
      const d = deskFor(person.deskIndex ?? 0);
      return [d[0], 0, d[2] - 0.85];
    }
  }
}

/** Everyone's spot, grouping people who share a location. */
export function placePeople(people: OfficePerson[]) {
  const groups = new Map<string, OfficePerson[]>();
  for (const p of people) groups.set(p.location, [...(groups.get(p.location) ?? []), p]);
  return people.map((p) => {
    const group = groups.get(p.location) ?? [p];
    return { person: p, position: positionFor(p, group.indexOf(p), group.length) };
  });
}

/** The viewer's own desk (the door to "my desk"), if they have one. */
export function deskOf(person: OfficePerson | undefined): Vec3 | null {
  if (!person) return null;
  if (person.role === "director") return DIRECTOR_DESK;
  if (person.role === "manager") return MANAGER_DESK;
  return typeof person.deskIndex === "number" ? deskFor(person.deskIndex) : null;
}

/** Where each page object stands, and where the camera looks when its page is open. */
export const SPOTS: Record<Exclude<SpotKey, "desk">, { at: Vec3; rotation?: number; target: Vec3; offset: Vec3; ring: Vec3; labelY: number }> = {
  tasks: { at: [-2.6, 0, -8.35], target: [-2.6, 1.5, -8.3], offset: [0, 2.2, 7.5], ring: [0, 0, 0.9], labelY: 2.75 },
  inbox: { at: [2.5, 0, -8.3], target: [2.5, 1.5, -8.3], offset: [0, 2.2, 7.5], ring: [0, 0, 0.9], labelY: 2.75 },
  meetings: { at: [8, 0, -5.8], target: [8, 1.2, -6.6], offset: [0, 6.5, 10], ring: [0, 0, 2.3], labelY: 3.3 },
  calendar: { at: [-13.2, 0, 1.6], rotation: Math.PI / 2, target: [-13, 1.8, 1.6], offset: [7, 1.6, 0.4], ring: [0, 0, 0.9], labelY: 3 },
  reports: { at: [-8, 0, -1.3], target: [-8, 1.4, -1.3], offset: [1.5, 2.4, 6.5], ring: [0, 0, 0.6], labelY: 2.65 },
  notifications: { at: [5.6, 0, 8.8], target: [5.6, 0.9, 8.8], offset: [2, 2.8, 6], ring: [0, 0, 0.6], labelY: 2.05 },
  me: { at: [-13.1, 0, 8.2], rotation: Math.PI / 2, target: [-12.8, 1.3, 8.2], offset: [6.5, 2, 1.2], ring: [0, 0, 0.9], labelY: 2.85 },
  admin: { at: [12.6, 0, 8.9], target: [12.6, 1.1, 8.9], offset: [-2.5, 3, 6], ring: [0, 0, 0.7], labelY: 2.6 },
};
