import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type BodyKind = "hatch" | "muscle" | "exotic" | "sedan";

export interface CarSpec {
  id: string;
  name: string;
  desc: string;
  body: BodyKind;
  maxSpeed: number;   // m/s, engine power fades toward this
  accel: number;      // m/s^2
  brake: number;      // m/s^2
  grip: number;       // lateral velocity decay, 1/s
  driftGrip: number;  // grip with handbrake
  latAccel: number;   // max cornering acceleration m/s^2
  steer: number;      // max steer angle, rad
  nitro: number;      // extra m/s^2
  mass: number;
  stats: [number, number, number, number]; // speed, accel, handling, nitro 0..1 for the garage bars
}

export const PLAYER_CARS: CarSpec[] = [
  { id: "hatch", name: "PUNTO DUNTO", desc: "Hot hatch. Sticks to corners like gum to a shoe. Won't outrun anything, might out-turn everything.", body: "hatch",
    maxSpeed: 54, accel: 11.5, brake: 24, grip: 8, driftGrip: 1.7, latAccel: 22, steer: 0.62, nitro: 10, mass: 1100, stats: [0.5, 0.55, 0.95, 0.6] },
  { id: "muscle", name: "MUSTANGLE GT", desc: "Loud, heavy, permanently sideways. Straight-line hero, corner zero.", body: "muscle",
    maxSpeed: 68, accel: 13.5, brake: 21, grip: 5.4, driftGrip: 1.1, latAccel: 16, steer: 0.55, nitro: 13, mass: 1650, stats: [0.75, 0.8, 0.5, 0.85] },
  { id: "exotic", name: "LAMBORGRINI", desc: "Italian-ish. Costs more than the buildings you'll hit with it.", body: "exotic",
    maxSpeed: 80, accel: 15, brake: 25, grip: 6.8, driftGrip: 1.4, latAccel: 19, steer: 0.5, nitro: 12, mass: 1400, stats: [1, 1, 0.75, 0.75] },
];

export const POLICE_SPEC: CarSpec = { id: "police", name: "CRUISER", desc: "", body: "sedan", maxSpeed: 50, accel: 13, brake: 24, grip: 7, driftGrip: 1.6, latAccel: 20, steer: 0.6, nitro: 0, mass: 1750, stats: [0, 0, 0, 0] };
export const TRAFFIC_SPEC: CarSpec = { id: "civ", name: "COMMUTER", desc: "", body: "sedan", maxSpeed: 26, accel: 6, brake: 16, grip: 7, driftGrip: 1.6, latAccel: 14, steer: 0.55, nitro: 0, mass: 1350, stats: [0, 0, 0, 0] };

export const PAINTS = [
  { name: "MIDNIGHT", hex: 0x1b1f2a }, { name: "RACE RED", hex: 0xd21f2b }, { name: "ELECTRIC BLUE", hex: 0x2a6df0 }, { name: "ACID LIME", hex: 0xa8e13a },
  { name: "SUNSET ORANGE", hex: 0xff7a1a }, { name: "PEARL WHITE", hex: 0xeceff1 }, { name: "GUNMETAL", hex: 0x5a5f66 }, { name: "HOT PINK", hex: 0xff3d8a },
];
export const CIVILIAN_COLORS = [0x8a8f96, 0xdfe2e6, 0x2b2f36, 0x6b1f22, 0x24476e, 0x5b6b3a, 0xb7a26b, 0x8c4a2b, 0x3f3f3f];

const GLASS_TINT = 0x0b0e14;
const BLACK = 0x111215;
const CHROME = 0xb9bcc2;

function tint(src: THREE.BufferGeometry, color: number) {
  // mergeGeometries needs every part indexed the same way, so make everything non-indexed
  const g = src.index ? src.toNonIndexed() : src;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return tint(g, color);
}

/** Rounded bar along x (a capsule on its side). */
function bar(r: number, len: number, x: number, y: number, z: number, color: number) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 3, 8);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return tint(g, color);
}

// ---------- lofted hull ----------
// The body is a loft through cross-sections ("stations") along the length. u runs rearward-negative to
// forward-positive and maps to -z. Each station is a half section: floor, sill, shoulder (beltline) and roof.
type Glass = "none" | "sides" | "top" | "all";
interface Station {
  u: number; floor: number; halfW: number; shoulderY: number; roofY: number; roofW: number;
  glass: Glass; // what the segment from this station to the next is made of, above the beltline
}
interface Body { L: number; W: number; wu: number; wheelR: number; stations: Station[]; }

const st = (u: number, floor: number, halfW: number, shoulderY: number, roofY: number, roofW: number, glass: Glass = "none"): Station =>
  ({ u, floor, halfW, shoulderY, roofY, roofW, glass });

const BODIES: Record<BodyKind, Body> = {
  hatch: { L: 3.9, W: 1.8, wu: 1.25, wheelR: 0.32, stations: [
    st(-1.95, 0.36, 0.78, 0.88, 0.98, 0.6),
    st(-1.86, 0.32, 0.88, 0.9, 1.06, 0.7, "top"),
    st(-1.3, 0.3, 0.9, 0.9, 1.42, 0.72, "sides"),
    st(-0.62, 0.3, 0.9, 0.9, 1.43, 0.73),
    st(-0.5, 0.3, 0.9, 0.9, 1.43, 0.73, "sides"),
    st(0.1, 0.3, 0.9, 0.9, 1.42, 0.72, "top"),
    st(0.7, 0.3, 0.9, 0.86, 0.9, 0.84),
    st(1.8, 0.32, 0.88, 0.7, 0.8, 0.78),
    st(1.95, 0.36, 0.78, 0.6, 0.66, 0.6),
  ] },
  muscle: { L: 4.9, W: 1.95, wu: 1.475, wheelR: 0.36, stations: [
    st(-2.45, 0.36, 0.86, 0.74, 0.8, 0.68),
    st(-2.36, 0.32, 0.97, 0.9, 0.96, 0.8),
    st(-1.7, 0.3, 0.98, 0.92, 0.98, 0.82, "top"),
    st(-1.0, 0.3, 0.95, 0.9, 1.32, 0.7, "sides"),
    st(-0.45, 0.3, 0.93, 0.9, 1.33, 0.7),
    st(-0.33, 0.3, 0.93, 0.9, 1.33, 0.7, "sides"),
    st(0.0, 0.3, 0.94, 0.9, 1.32, 0.7, "top"),
    st(0.7, 0.3, 0.96, 0.86, 0.9, 0.86),
    st(2.3, 0.32, 0.96, 0.72, 0.84, 0.86),
    st(2.45, 0.36, 0.86, 0.6, 0.68, 0.7),
  ] },
  exotic: { L: 4.5, W: 2.0, wu: 1.35, wheelR: 0.36, stations: [
    st(-2.25, 0.3, 0.9, 0.62, 0.68, 0.72),
    st(-2.15, 0.28, 0.99, 0.78, 0.84, 0.86),
    st(-1.45, 0.28, 1.0, 0.8, 0.9, 0.85, "top"),
    st(-0.85, 0.28, 0.98, 0.78, 1.13, 0.6, "sides"),
    st(-0.4, 0.28, 0.97, 0.76, 1.14, 0.6),
    st(-0.3, 0.28, 0.97, 0.75, 1.14, 0.6, "sides"),
    st(-0.1, 0.28, 0.97, 0.74, 1.12, 0.62, "top"),
    st(0.85, 0.28, 0.98, 0.7, 0.74, 0.88),
    st(2.1, 0.3, 0.96, 0.5, 0.6, 0.8),
    st(2.25, 0.34, 0.85, 0.4, 0.46, 0.6),
  ] },
  sedan: { L: 4.7, W: 1.9, wu: 1.425, wheelR: 0.34, stations: [
    st(-2.35, 0.36, 0.84, 0.72, 0.78, 0.66),
    st(-2.26, 0.32, 0.93, 0.92, 0.98, 0.8),
    st(-1.6, 0.3, 0.95, 0.94, 1.0, 0.82, "top"),
    st(-0.95, 0.3, 0.95, 0.92, 1.4, 0.72, "sides"),
    st(-0.5, 0.3, 0.95, 0.92, 1.41, 0.72),
    st(-0.38, 0.3, 0.95, 0.92, 1.41, 0.72, "sides"),
    st(0.05, 0.3, 0.95, 0.92, 1.4, 0.72, "top"),
    st(0.75, 0.3, 0.95, 0.88, 0.92, 0.86),
    st(2.2, 0.32, 0.93, 0.74, 0.84, 0.82),
    st(2.35, 0.36, 0.84, 0.62, 0.68, 0.66),
  ] },
};

const CORNERS: [number, number][] = [[0.5, 3], [0.35, 2], [0.25, 2], [0.5, 4]]; // [rounding, samples] for rocker, sill, belt, roof
const HALF_COUNT = 1 + CORNERS.reduce((a, c) => a + c[1] + 1, 0) + 1; // 17
const RING = HALF_COUNT * 2 - 2; // 32
const BELT_END = 1 + (CORNERS[0][1] + 1) + (CORNERS[1][1] + 1) + (CORNERS[2][1] + 1) - 1; // right-half index just above the beltline

/** Right half of a station's outline, bottom centre to top centre, as [x, y] pairs. Always HALF_COUNT points. */
function halfSection(s: Station): [number, number][] {
  const sillY = Math.min(s.floor + 0.14, s.shoulderY - 0.1);
  const roofY = Math.max(s.roofY, s.shoulderY + 0.02);
  const keys: [number, number][] = [[0, s.floor], [s.halfW - 0.08, s.floor], [s.halfW, sillY], [s.halfW, s.shoulderY], [s.roofW, roofY], [0, roofY + 0.025]];
  const out: [number, number][] = [keys[0]];
  for (let i = 1; i <= 4; i++) {
    const [round, samples] = CORNERS[i - 1];
    const P = keys[i], Pp = keys[i - 1], Pn = keys[i + 1];
    const l1 = Math.hypot(Pp[0] - P[0], Pp[1] - P[1]), l2 = Math.hypot(Pn[0] - P[0], Pn[1] - P[1]);
    const rad = round * Math.min(l1, l2) * 0.5;
    const A: [number, number] = l1 > 1e-6 ? [P[0] + (Pp[0] - P[0]) / l1 * rad, P[1] + (Pp[1] - P[1]) / l1 * rad] : P;
    const B: [number, number] = l2 > 1e-6 ? [P[0] + (Pn[0] - P[0]) / l2 * rad, P[1] + (Pn[1] - P[1]) / l2 * rad] : P;
    for (let k = 0; k <= samples; k++) {
      const t = k / samples, mt = 1 - t;
      out.push([mt * mt * A[0] + 2 * mt * t * P[0] + t * t * B[0], mt * mt * A[1] + 2 * mt * t * P[1] + t * t * B[1]]);
    }
  }
  out.push(keys[5]);
  return out;
}

/** Full ring for a station: right half then mirrored left half, RING points. */
function ring(s: Station): [number, number][] {
  const r = halfSection(s);
  const out = [...r];
  for (let i = HALF_COUNT - 2; i >= 1; i--) out.push([-r[i][0], r[i][1]]);
  return out;
}

/** Which part of the section a ring quad (between ring point i and i+1) belongs to. */
function region(i: number): "lower" | "side" | "top" {
  const leftOf = (right: number) => RING - right; // ring index of the mirrored right-half index
  // side glass: the quad above the beltline plus the lower part of the roof rounding (the tumblehome)
  const sideTop = BELT_END + 2;
  if ((i >= BELT_END && i <= sideTop) || (i >= leftOf(sideTop + 1) && i <= leftOf(BELT_END + 1))) return "side";
  if (i > sideTop && i < leftOf(sideTop + 1)) return "top";
  return "lower";
}

function lerpStation(a: Station, b: Station, t: number, u: number): Station {
  const L = (x: number, y: number) => x + (y - x) * t;
  return { u, floor: L(a.floor, b.floor), halfW: L(a.halfW, b.halfW), shoulderY: L(a.shoulderY, b.shoulderY), roofY: L(a.roofY, b.roofY), roofW: L(a.roofW, b.roofW), glass: a.glass };
}

function stationAt(stations: Station[], u: number): Station {
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    if (u >= a.u && u <= b.u) return lerpStation(a, b, (u - a.u) / (b.u - a.u), u);
  }
  return { ...stations[u < stations[0].u ? 0 : stations.length - 1], u };
}

/** Key stations plus extra stations that lift the floor into wheel arches and flare the fenders. */
function withArches(body: Body): Station[] {
  const out = [...body.stations];
  const archR = body.wheelR + 0.1;
  for (const wu of [-body.wu, body.wu]) {
    for (const d of [-(archR + 0.03), -archR * 0.72, -archR * 0.3, 0, archR * 0.3, archR * 0.72, archR + 0.03]) {
      const s = stationAt(body.stations, wu + d);
      const inside = Math.abs(d) < archR;
      if (inside) {
        s.floor = Math.min(s.shoulderY - 0.1, body.wheelR + Math.sqrt(archR * archR - d * d));
        const flare = 0.05 * (1 - Math.abs(d) / archR);
        s.halfW += flare; s.roofW += flare * 0.5;
      }
      out.push(s);
    }
  }
  out.sort((a, b) => a.u - b.u);
  return out;
}

/** Build the hull. Group 0 = paint, group 1 = glass. */
function buildHull(body: Body) {
  const stations = withArches(body);
  const pos: number[] = [];
  const rings = stations.map((s) => ring(s));
  for (const r of rings) for (const [x, y] of r) pos.push(x, y, 0);
  // z from u
  for (let s = 0; s < stations.length; s++) for (let i = 0; i < RING; i++) pos[(s * RING + i) * 3 + 2] = -stations[s].u;
  const paint: number[] = [], glass: number[] = [];
  for (let s = 0; s < stations.length - 1; s++) {
    const g = stations[s].glass;
    for (let i = 0; i < RING; i++) {
      const a = s * RING + i, b = s * RING + (i + 1) % RING, c = (s + 1) * RING + (i + 1) % RING, d = (s + 1) * RING + i;
      const reg = region(i);
      const isGlass = (reg === "side" && (g === "sides" || g === "all")) || (reg === "top" && (g === "top" || g === "all"));
      (isGlass ? glass : paint).push(a, c, b, a, d, c);
    }
  }
  // end caps
  const cap = (s: number, front: boolean) => {
    const r = rings[s];
    let cx = 0, cy = 0;
    for (const [x, y] of r) { cx += x; cy += y; }
    const ci = pos.length / 3;
    pos.push(cx / RING, cy / RING, -stations[s].u);
    for (let i = 0; i < RING; i++) {
      const a = s * RING + i, b = s * RING + (i + 1) % RING;
      if (front) paint.push(ci, b, a); else paint.push(ci, a, b);
    }
  };
  cap(0, false);
  cap(stations.length - 1, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex([...paint, ...glass]);
  geo.addGroup(0, paint.length, 0);
  geo.addGroup(paint.length, glass.length, 1);
  geo.computeVertexNormals();
  return geo;
}

const paintMats = new Map<number, THREE.MeshPhysicalMaterial>();
function paintMaterial(color: number) {
  let m = paintMats.get(color);
  if (!m) { m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.4, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 }); paintMats.set(color, m); }
  return m;
}
let trimMat: THREE.MeshStandardMaterial | null = null;
let glassMat: THREE.MeshStandardMaterial | null = null;
let wheelMat: THREE.MeshStandardMaterial | null = null;
let headMat: THREE.MeshStandardMaterial | null = null;
const wheelGeos = new Map<number, THREE.BufferGeometry>();

function wheelGeometry(r: number) {
  let g = wheelGeos.get(r);
  if (!g) {
    const tire = tint(new THREE.CylinderGeometry(r, r, 0.26, 20), 0x15161a);
    const rim = tint(new THREE.CylinderGeometry(r - 0.1, r - 0.1, 0.28, 12), CHROME);
    const hub = tint(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), 0x2a2c30);
    const spokes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const sp = tint(new THREE.BoxGeometry(0.05, 0.3, (r - 0.1) * 1.9), 0x2a2c30);
      sp.rotateY((i / 5) * Math.PI * 2);
      spokes.push(sp);
    }
    g = mergeGeometries([tire, rim, hub, ...spokes]);
    g.rotateZ(Math.PI / 2);
    wheelGeos.set(r, g);
  }
  return g;
}

export interface CarMesh {
  group: THREE.Group;
  wheels: THREE.Mesh[];       // all 4 (animated) or empty (static)
  frontWheels: THREE.Mesh[];
  tail: THREE.MeshStandardMaterial;
  lightbar?: { red: THREE.MeshStandardMaterial; blue: THREE.MeshStandardMaterial };
}

export function wheelbaseFor(kind: BodyKind) {
  return BODIES[kind].wu * 2;
}

export function buildCarMesh(kind: BodyKind, paint: number, opts: { police?: boolean; animatedWheels?: boolean } = {}): CarMesh {
  const body = BODIES[kind];
  const { L, W } = body;
  const h = L / 2;
  const S = body.stations;
  const tail = S[0], tail2 = S[1], nose = S[S.length - 1], hood = S[S.length - 2];
  const belt = S[Math.floor(S.length / 2)].shoulderY;
  const wsTop = [...S].reverse().find((s) => s.glass === "top")!; // front-most windshield station
  const wsBase = S[S.indexOf(wsTop) + 1];
  const roofY = Math.max(...S.map((s) => s.roofY));

  if (!glassMat) glassMat = new THREE.MeshStandardMaterial({ color: GLASS_TINT, roughness: 0.06, metalness: 0.9 });
  const hull = new THREE.Mesh(buildHull(body), [paintMaterial(opts.police ? 0xf2f2f2 : paint), glassMat]);
  hull.castShadow = true;
  hull.receiveShadow = true;
  const group = new THREE.Group();
  group.add(hull);

  // trim: chassis, bumpers, grille, mirrors, plate, exhausts, seams, extras
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(W - 0.5, 0.36, L - 0.5, 0, tail2.floor + 0.12, 0, BLACK));
  parts.push(bar(0.08, W - 0.2, 0, nose.floor + 0.1, -(h - 0.02), BLACK));
  parts.push(bar(0.08, W - 0.2, 0, tail.floor + 0.1, h - 0.02, BLACK));
  parts.push(box(W * 0.4, 0.12, 0.06, 0, (nose.floor + nose.shoulderY) / 2 + 0.06, -h, BLACK));
  const mz = -(wsBase.u - 0.1);
  parts.push(bar(0.05, 0.16, -(W / 2 + 0.06), belt + 0.1, mz, opts.police ? 0xf2f2f2 : paint));
  parts.push(bar(0.05, 0.16, W / 2 + 0.06, belt + 0.1, mz, opts.police ? 0xf2f2f2 : paint));
  parts.push(box(0.4, 0.12, 0.02, 0, tail.shoulderY - 0.24, h + 0.005, 0xe8e8e0));
  const ex = (x: number) => tint(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8).rotateX(Math.PI / 2).translate(x, tail.floor - 0.02, h + 0.02), 0x3a3c40);
  parts.push(ex(-0.5));
  if (kind !== "hatch") parts.push(ex(0.5));
  // door seams: thin dark lines on both sides
  const seamY = (belt + tail2.floor) / 2 + 0.05, seamH = belt - tail2.floor - 0.3;
  const seams = kind === "hatch" || kind === "exotic" ? [-(wsBase.u - 0.3)] : [-(wsBase.u - 0.3), 0.55];
  for (const sz of seams) {
    parts.push(box(W + 0.02, seamH, 0.015, 0, seamY, sz, 0x0a0b0d));
  }
  if (kind === "muscle") {
    parts.push(box(0.8, 0.1, 1.2, 0, hood.roofY + 0.0, -(hood.u - 0.9), paint)); // hood bulge
    parts.push(box(W + 0.02, 0.18, 0.5, 0, belt - 0.22, -(wsBase.u - 0.9), BLACK)); // side scoops
    parts.push(box(W - 0.4, 0.05, 0.26, 0, tail2.roofY + 0.03, -(tail2.u + 0.12), paint)); // lip spoiler
  }
  if (kind === "exotic") {
    parts.push(box(W + 0.02, 0.24, 0.55, 0, belt - 0.2, 0.75, BLACK)); // side intakes behind the doors
    parts.push(box(W - 0.1, 0.05, 0.42, 0, tail2.roofY + 0.36, -(tail2.u + 0.05), BLACK)); // wing
    parts.push(box(0.07, 0.36, 0.28, -0.7, tail2.roofY + 0.17, -(tail2.u + 0.05), BLACK));
    parts.push(box(0.07, 0.36, 0.28, 0.7, tail2.roofY + 0.17, -(tail2.u + 0.05), BLACK));
    parts.push(box(W - 0.4, 0.14, 0.2, 0, tail.floor + 0.02, h - 0.08, BLACK)); // diffuser
  }
  if (kind === "hatch") parts.push(box(W - 0.5, 0.05, 0.3, 0, roofY + 0.02, -(S[2].u - 0.1), paint)); // roof spoiler
  if (opts.police) {
    parts.push(box(W + 0.03, belt - tail2.floor - 0.2, 1.5, 0, (belt + tail2.floor) / 2, 0.15, BLACK)); // black doors
    parts.push(box(W + 0.05, 0.05, L * 0.6, 0, belt - 0.03, 0.15, 0x1a3fbf)); // blue stripe
    parts.push(box(0.6, 0.03, hood.u - wsBase.u - 0.3, 0, (hood.roofY + wsBase.roofY) / 2 + 0.04, -(hood.u + wsBase.u) / 2, BLACK)); // hood stripe
    parts.push(box(1.2, 0.05, 1.0, 0, roofY + 0.03, -(S[3].u + S[6].u) / 2, BLACK)); // roof
    parts.push(bar(0.04, W - 0.4, 0, nose.floor + 0.3, -(h + 0.12), BLACK)); // push bar
    parts.push(box(0.05, 0.3, 0.14, -0.5, nose.floor + 0.2, -(h + 0.06), BLACK));
    parts.push(box(0.05, 0.3, 0.14, 0.5, nose.floor + 0.2, -(h + 0.06), BLACK));
  }
  if (!trimMat) trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.45 });
  const trim = new THREE.Mesh(mergeGeometries(parts), trimMat);
  trim.castShadow = true;
  group.add(trim);

  // lights, shaped per car
  if (!headMat) headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 2.2 });
  const hw = W / 2 - 0.3;
  const hy = nose.shoulderY + 0.02, hz = -(h - 0.03);
  const heads: THREE.BufferGeometry[] = [];
  if (kind === "muscle") for (const x of [-hw - 0.1, -hw + 0.14, hw - 0.14, hw + 0.1]) heads.push(tint(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 10).rotateX(Math.PI / 2).translate(x, hy, hz), 0xffffff));
  else if (kind === "exotic") heads.push(box(0.5, 0.05, 0.1, -hw, hy, hz, 0xffffff), box(0.5, 0.05, 0.1, hw, hy, hz, 0xffffff));
  else if (kind === "hatch") heads.push(box(0.3, 0.2, 0.1, -hw, hy, hz, 0xffffff), box(0.3, 0.2, 0.1, hw, hy, hz, 0xffffff));
  else heads.push(box(0.42, 0.13, 0.1, -hw, hy, hz, 0xffffff), box(0.42, 0.13, 0.1, hw, hy, hz, 0xffffff));
  group.add(new THREE.Mesh(mergeGeometries(heads), headMat));
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2010, emissiveIntensity: 0.8 });
  const ty = tail.shoulderY - 0.02, tz = h - 0.02;
  const tails: THREE.BufferGeometry[] = [];
  if (kind === "muscle") for (const x of [-hw - 0.1, -hw + 0.14, hw - 0.14, hw + 0.1]) tails.push(tint(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 10).rotateX(Math.PI / 2).translate(x, ty, tz), 0xffffff));
  else if (kind === "exotic") tails.push(box(W - 0.5, 0.05, 0.08, 0, ty, tz, 0xffffff));
  else if (kind === "hatch") tails.push(box(0.14, 0.32, 0.08, -hw - 0.1, ty - 0.02, tz, 0xffffff), box(0.14, 0.32, 0.08, hw + 0.1, ty - 0.02, tz, 0xffffff));
  else tails.push(box(0.5, 0.12, 0.08, -hw, ty, tz, 0xffffff), box(0.5, 0.12, 0.08, hw, ty, tz, 0xffffff));
  group.add(new THREE.Mesh(mergeGeometries(tails), tailMat));

  let lightbar: CarMesh["lightbar"];
  if (opts.police) {
    const red = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 0.3 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2a5cff, emissiveIntensity: 0.3 });
    const lz = -(S[3].u + S[6].u) / 2 + 0.1;
    const rm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), red); rm.position.set(-0.34, roofY + 0.14, lz);
    const bm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), blue); bm.position.set(0.34, roofY + 0.14, lz);
    group.add(rm, bm);
    lightbar = { red, blue };
  }

  // wheels
  if (!wheelMat) wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.6 });
  const wg = wheelGeometry(body.wheelR);
  const track = W / 2 - 0.1;
  const wheelPos = [[-track, -body.wu], [track, -body.wu], [-track, body.wu], [track, body.wu]];
  const wheels: THREE.Mesh[] = [];
  const frontWheels: THREE.Mesh[] = [];
  if (opts.animatedWheels) {
    wheelPos.forEach(([x, z], i) => {
      const w = new THREE.Mesh(wg, wheelMat!);
      w.position.set(x, body.wheelR, z);
      w.castShadow = true;
      group.add(w);
      wheels.push(w);
      if (i < 2) frontWheels.push(w);
    });
  } else {
    const gs = wheelPos.map(([x, z]) => { const g = wg.clone(); g.translate(x, body.wheelR, z); return g; });
    const wm = new THREE.Mesh(mergeGeometries(gs), wheelMat);
    wm.castShadow = true;
    group.add(wm);
  }
  return { group, wheels, frontWheels, tail: tailMat, lightbar };
}

export interface AABB { minX: number; maxX: number; minZ: number; maxZ: number; }

export class Car {
  x = 0; z = 0; y = 0;
  heading = 0;
  vx = 0; vz = 0;
  yawRate = 0;
  throttle = 0;
  steer = 0;
  handbrake = false;
  nitroOn = false;
  nitro = 100;
  health = 100;
  wrecked = false;
  drifting = false;
  slip = 0;          // lateral speed magnitude
  gripBlend = 1;
  mesh: CarMesh;
  halfLen: number;
  radius = 1.05;
  private wheelSpin = 0;
  private visualSteer = 0;
  private roll = 0;
  private pitch = 0;

  constructor(public spec: CarSpec, paint: number, opts: { police?: boolean; animatedWheels?: boolean } = {}) {
    this.mesh = buildCarMesh(spec.body, paint, opts);
    this.halfLen = wheelbaseFor(spec.body) / 2 + 0.2;
  }

  get group() { return this.mesh.group; }
  get fx() { return -Math.sin(this.heading); }
  get fz() { return -Math.cos(this.heading); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * this.fx + this.vz * this.fz; }
  get kmh() { return this.speed * 3.6; }

  place(x: number, z: number, heading: number) {
    this.x = x; this.z = z; this.heading = heading;
    this.vx = this.vz = 0; this.yawRate = 0;
    this.throttle = 0; this.steer = 0; this.handbrake = false;
    this.health = 100; this.wrecked = false; this.gripBlend = 1;
    this.syncMesh();
  }

  /** Front and rear collision circles. */
  circles(): [number, number, number, number] {
    const fx = this.fx, fz = this.fz, l = this.halfLen;
    return [this.x + fx * l, this.z + fz * l, this.x - fx * l, this.z - fz * l];
  }

  update(dt: number, groundY: (x: number, z: number) => number) {
    const s = this.spec;
    const fx = this.fx, fz = this.fz;
    const rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;
    const absF = Math.abs(vF);

    if (this.wrecked) { this.throttle = 0; this.handbrake = true; this.nitroOn = false; }

    // longitudinal forces
    let force = 0;
    const powerBand = Math.max(0, 1 - Math.pow(Math.max(0, vF) / s.maxSpeed, 3));
    if (this.throttle > 0) {
      if (vF < -0.5) force += s.brake;
      else force += this.throttle * s.accel * powerBand * (this.drifting ? 0.75 : 1);
    } else if (this.throttle < 0) {
      if (vF > 0.5) force -= s.brake;
      else force -= s.accel * 0.45 * Math.max(0, 1 - Math.pow(absF / 14, 2));
    }
    if (this.nitroOn && this.nitro > 0 && this.throttle > 0 && !this.wrecked) {
      force += s.nitro;
      this.nitro = Math.max(0, this.nitro - 28 * dt);
    } else {
      this.nitro = Math.min(100, this.nitro + (this.drifting ? 12 : 5) * dt);
    }
    force -= 0.03 * vF + 0.0004 * vF * absF;
    if (this.handbrake) force -= Math.sign(vF) * Math.min(absF / dt, 7);
    vF += force * dt;

    // lateral grip
    const targetBlend = this.handbrake ? 0 : 1;
    this.gripBlend += (targetBlend - this.gripBlend) * Math.min(1, dt * (this.handbrake ? 14 : 3));
    let grip = s.driftGrip + (s.grip - s.driftGrip) * this.gripBlend;
    this.slip = Math.abs(vR);
    this.drifting = this.slip > 4.5 && this.speed > 8;
    if (this.drifting && !this.handbrake) grip *= 0.55;
    vR *= Math.exp(-grip * dt);

    // steering
    const speedFactor = 1 / (1 + absF / 24);
    const steerAngle = this.steer * s.steer * speedFactor;
    const wb = wheelbaseFor(s.body);
    const kinematic = (vF / wb) * Math.tan(steerAngle);
    const gripLimit = (s.latAccel * (this.handbrake ? 1.9 : 1)) / Math.max(2, absF);
    let yawTarget = Math.sign(kinematic || 0) * Math.min(Math.abs(kinematic), gripLimit);
    if (this.drifting) yawTarget += this.steer * 0.6 * Math.min(1, this.slip / 10) * Math.sign(vF || 1);
    if (this.wrecked) yawTarget = 0;
    this.yawRate += (yawTarget - this.yawRate) * Math.min(1, dt * 9);
    this.heading += this.yawRate * dt;

    this.vx = fx * vF + rx * vR;
    this.vz = fz * vF + rz * vR;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // visuals
    const targetY = groundY(this.x, this.z);
    this.y += (targetY - this.y) * Math.min(1, dt * 10);
    this.wheelSpin += vF * dt / 0.34;
    this.visualSteer += (steerAngle * 1.6 - this.visualSteer) * Math.min(1, dt * 10);
    const latAcc = vF * this.yawRate;
    this.roll += ((-latAcc * 0.012) - this.roll) * Math.min(1, dt * 6);
    this.pitch += ((-force * 0.006) - this.pitch) * Math.min(1, dt * 6);
    this.syncMesh();
  }

  syncMesh() {
    const g = this.mesh.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.set(this.pitch, this.heading, this.roll, "YXZ");
    for (const w of this.mesh.wheels) w.rotation.x = this.wheelSpin;
    for (const w of this.mesh.frontWheels) { w.rotation.y = this.visualSteer; w.rotation.x = this.wheelSpin; }
    this.mesh.tail.emissiveIntensity = this.throttle < 0 || this.handbrake ? 3 : 0.8;
  }

  damage(amount: number) {
    if (this.wrecked) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.wrecked = true;
      this.mesh.tail.emissiveIntensity = 0;
    }
  }
}

/** Resolve one car against an axis-aligned box. Returns impact speed (0 if none). */
export function collideCarBox(car: Car, b: AABB): number {
  const c = car.circles();
  const r = car.radius;
  let impact = 0;
  for (let k = 0; k < 2; k++) {
    const cx = c[k * 2], cz = c[k * 2 + 1];
    const px = Math.max(b.minX, Math.min(b.maxX, cx));
    const pz = Math.max(b.minZ, Math.min(b.maxZ, cz));
    let dx = cx - px, dz = cz - pz;
    let dist = Math.hypot(dx, dz);
    if (dist >= r) continue;
    if (dist < 1e-4) {
      // center inside box: push out along the nearest face
      const dl = cx - b.minX, dr = b.maxX - cx, dn = cz - b.minZ, df = b.maxZ - cz;
      const m = Math.min(dl, dr, dn, df);
      if (m === dl) { dx = -1; dz = 0; } else if (m === dr) { dx = 1; dz = 0; } else if (m === dn) { dx = 0; dz = -1; } else { dx = 0; dz = 1; }
      dist = 0;
    } else { dx /= dist; dz /= dist; }
    const push = r - dist;
    car.x += dx * push;
    car.z += dz * push;
    const vn = car.vx * dx + car.vz * dz;
    if (vn < 0) {
      car.vx -= dx * vn * 1.3;
      car.vz -= dz * vn * 1.3;
      car.vx *= 0.9; car.vz *= 0.9;
      // spin the car away from the wall depending on which end hit
      const lever = k === 0 ? 1 : -1;
      const cross = car.fx * dz - car.fz * dx;
      car.yawRate += lever * cross * Math.min(6, -vn) * 0.35;
      impact = Math.max(impact, -vn);
    }
  }
  return impact;
}

/** Resolve two cars. Returns relative impact speed (0 if none). */
export function collideCars(a: Car, b: Car): number {
  const dxc = a.x - b.x, dzc = a.z - b.z;
  if (dxc * dxc + dzc * dzc > 64) return 0;
  const ca = a.circles(), cb = b.circles();
  const rr = a.radius + b.radius;
  let impact = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const ax = ca[i * 2], az = ca[i * 2 + 1], bx = cb[j * 2], bz = cb[j * 2 + 1];
    let dx = ax - bx, dz = az - bz;
    let dist = Math.hypot(dx, dz);
    if (dist >= rr) continue;
    if (dist < 1e-4) { dx = 1; dz = 0; dist = 1e-4; }
    dx /= dist; dz /= dist;
    const overlap = rr - dist;
    const ma = a.spec.mass, mb = b.spec.mass, mt = ma + mb;
    a.x += dx * overlap * (mb / mt); a.z += dz * overlap * (mb / mt);
    b.x -= dx * overlap * (ma / mt); b.z -= dz * overlap * (ma / mt);
    const rvx = a.vx - b.vx, rvz = a.vz - b.vz;
    const vrel = rvx * dx + rvz * dz;
    if (vrel < 0) {
      const jn = (-(1 + 0.35) * vrel) / (1 / ma + 1 / mb);
      a.vx += dx * jn / ma; a.vz += dz * jn / ma;
      b.vx -= dx * jn / mb; b.vz -= dz * jn / mb;
      const levA = i === 0 ? 1 : -1, levB = j === 0 ? 1 : -1;
      a.yawRate += levA * (a.fx * dz - a.fz * dx) * Math.min(6, -vrel) * 0.3;
      b.yawRate -= levB * (b.fx * dz - b.fz * dx) * Math.min(6, -vrel) * 0.3;
      impact = Math.max(impact, -vrel);
    }
  }
  // recompute circles after the move so both stay consistent
  if (impact > 0) { a.syncMesh(); b.syncMesh(); }
  return impact;
}
