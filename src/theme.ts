export interface Colorway {
  id: string;
  name: string;
  accent: string;
  accentDim: string;
  bg: string;
  panel: string;
}

export const COLORWAYS: Colorway[] = [
  { id: "orange", name: "SUNSET ORANGE & BLACK", accent: "#ff8a1f", accentDim: "#a85a14", bg: "#0b0806", panel: "rgba(14, 10, 6, 0.72)" },
  { id: "blue", name: "PATROL BLUE & BLACK", accent: "#3fa9ff", accentDim: "#2a6aa8", bg: "#05090f", panel: "rgba(5, 9, 15, 0.72)" },
  { id: "lime", name: "NEON LIME & BLACK", accent: "#c6ff3a", accentDim: "#7fa51f", bg: "#090b07", panel: "rgba(10, 13, 8, 0.72)" },
  { id: "pink", name: "HOT PINK & DARK GREY", accent: "#ff3d8a", accentDim: "#a8285a", bg: "#160a10", panel: "rgba(24, 12, 18, 0.74)" },
];

const KEY = "lw.colorway";

export function currentColorway(): Colorway {
  const id = localStorage.getItem(KEY);
  return COLORWAYS.find((c) => c.id === id) ?? COLORWAYS[0];
}

export function applyColorway(c: Colorway) {
  const r = document.documentElement.style;
  r.setProperty("--accent", c.accent);
  r.setProperty("--accent-dim", c.accentDim);
  r.setProperty("--bg", c.bg);
  r.setProperty("--panel", c.panel);
  localStorage.setItem(KEY, c.id);
}

/** Accent color as a number for Three.js. */
export function accentHex(c = currentColorway()): number {
  return parseInt(c.accent.slice(1), 16);
}

export type CameraMode = "chase" | "hood";

export interface Settings {
  volume: number;   // 0..1
  camera: CameraMode;
  car: number;      // index into PLAYER_CARS
  paint: number;    // index into PAINTS
}

const SKEY = "lw.settings";
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) || "{}");
    return { volume: s.volume ?? 0.6, camera: s.camera === "hood" ? "hood" : "chase", car: s.car ?? 0, paint: s.paint ?? 1 };
  } catch { return { volume: 0.6, camera: "chase", car: 0, paint: 1 }; }
}
export function saveSettings(s: Settings) {
  localStorage.setItem(SKEY, JSON.stringify(s));
}

export interface Career {
  bountyTotal: number;
  bestBounty: number;
  busted: number;
  evaded: number;
  copsWrecked: number;
  blacklist: number;       // rivals beaten, 0..5
  racesWon: number;
  racesLost: number;
  topSpeed: number;        // km/h
  longestPursuit: number;  // seconds
}
const CKEY = "lw.career";
export function loadCareer(): Career {
  const d: Career = { bountyTotal: 0, bestBounty: 0, busted: 0, evaded: 0, copsWrecked: 0, blacklist: 0, racesWon: 0, racesLost: 0, topSpeed: 0, longestPursuit: 0 };
  try {
    const c = JSON.parse(localStorage.getItem(CKEY) || "{}");
    return { ...d, ...c };
  } catch { return d; }
}
export function saveCareer(c: Career) {
  localStorage.setItem(CKEY, JSON.stringify(c));
}
