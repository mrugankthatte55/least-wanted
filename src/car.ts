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
  // mergeGeometries needs every part indexed the same way; extrusions are non-indexed, so make everything non-indexed
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

/** Extrude a side profile (u forward, v up) across the car's width, centred on x = 0. Front ends up at -z. */
function extrudeProfile(shape: THREE.Shape, width: number, color: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(shape, bevel > 0
    ? { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 8 }
    : { depth: width, bevelEnabled: false, curveSegments: 8 });
  g.rotateY(Math.PI / 2);
  g.translate(-width / 2 + bevel, 0, 0);
  g.computeVertexNormals();
  return tint(g, color);
}

type Pt = [number, number];
interface Profile {
  L: number; W: number; bottom: number; wu: number; // wheel u offset from centre
  frontTop: Pt; hoodStart: Pt; wsBase: Pt; wsTop: Pt; roofEnd: Pt; rwBase: Pt; trunk: Pt; tailTop: Pt;
  spoiler?: "lip" | "wing";
}

const PROFILES: Record<BodyKind, Profile> = {
  hatch:  { L: 3.9, W: 1.8, bottom: 0.32, wu: 1.25, frontTop: [1.95, 0.62], hoodStart: [1.85, 0.8], wsBase: [0.7, 0.88], wsTop: [0.1, 1.42], roofEnd: [-1.25, 1.42], rwBase: [-1.85, 1.0], trunk: [-1.92, 0.96], tailTop: [-1.95, 0.9] },
  muscle: { L: 4.9, W: 1.95, bottom: 0.32, wu: 1.475, frontTop: [2.45, 0.62], hoodStart: [2.3, 0.82], wsBase: [0.7, 0.88], wsTop: [0.0, 1.32], roofEnd: [-1.0, 1.32], rwBase: [-1.7, 0.96], trunk: [-2.4, 0.96], tailTop: [-2.45, 0.74], spoiler: "lip" },
  exotic: { L: 4.5, W: 2.0, bottom: 0.28, wu: 1.35, frontTop: [2.25, 0.42], hoodStart: [2.1, 0.6], wsBase: [0.85, 0.72], wsTop: [-0.1, 1.12], roofEnd: [-0.85, 1.13], rwBase: [-1.45, 0.86], trunk: [-2.2, 0.84], tailTop: [-2.25, 0.56], spoiler: "wing" },
  sedan:  { L: 4.7, W: 1.9, bottom: 0.32, wu: 1.425, frontTop: [2.35, 0.62], hoodStart: [2.2, 0.84], wsBase: [0.75, 0.9], wsTop: [0.05, 1.4], roofEnd: [-0.95, 1.4], rwBase: [-1.6, 1.0], trunk: [-2.3, 0.98], tailTop: [-2.35, 0.7] },
};

const WHEEL_R = 0.34;
const ARCH_R = 0.44;

function bodyShape(p: Profile) {
  const s = new THREE.Shape();
  const h = p.L / 2;
  s.moveTo(-h, p.bottom);
  s.lineTo(-p.wu - ARCH_R, p.bottom);
  s.absarc(-p.wu, WHEEL_R, ARCH_R, Math.PI, 0, true);
  s.lineTo(p.wu - ARCH_R, p.bottom);
  s.absarc(p.wu, WHEEL_R, ARCH_R, Math.PI, 0, true);
  s.lineTo(h, p.bottom);
  s.lineTo(p.frontTop[0], p.frontTop[1]);
  s.lineTo(p.hoodStart[0], p.hoodStart[1]);
  s.lineTo(p.wsBase[0], p.wsBase[1]);
  s.lineTo(p.wsTop[0], p.wsTop[1]);
  s.lineTo(p.roofEnd[0], p.roofEnd[1]);
  s.lineTo(p.rwBase[0], p.rwBase[1]);
  s.lineTo(p.trunk[0], p.trunk[1]);
  s.lineTo(p.tailTop[0], p.tailTop[1]);
  s.lineTo(-h, p.bottom);
  return s;
}

function glassShape(p: Profile) {
  const s = new THREE.Shape();
  s.moveTo(p.wsBase[0] + 0.05, p.wsBase[1] - 0.06);
  s.lineTo(p.wsTop[0] + 0.03, p.wsTop[1] + 0.02);
  s.lineTo(p.roofEnd[0] - 0.03, p.roofEnd[1] + 0.02);
  s.lineTo(p.rwBase[0] - 0.05, p.rwBase[1]);
  s.lineTo(p.rwBase[0] - 0.05, p.rwBase[1] - 0.3);
  s.lineTo(p.wsBase[0] + 0.05, p.wsBase[1] - 0.3);
  return s;
}

let paintMatCache: THREE.MeshPhysicalMaterial | null = null;
function paintMaterial() {
  if (!paintMatCache) paintMatCache = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  return paintMatCache;
}
let glassMat: THREE.MeshStandardMaterial | null = null;
let wheelMat: THREE.MeshStandardMaterial | null = null;
let headMat: THREE.MeshStandardMaterial | null = null;
let wheelGeoCache: THREE.BufferGeometry | null = null;

function wheelGeometry() {
  if (!wheelGeoCache) {
    const tire = tint(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 18), 0x15161a);
    const rim = tint(new THREE.CylinderGeometry(0.24, 0.24, 0.28, 12), CHROME);
    const hub = tint(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), 0x2a2c30);
    const spokes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const sp = tint(new THREE.BoxGeometry(0.05, 0.36, 0.31), 0x2a2c30);
      sp.rotateY((i / 5) * Math.PI * 2);
      spokes.push(sp);
    }
    // the spokes are dark grooves in the chrome disc, read as a rim pattern from any distance
    wheelGeoCache = mergeGeometries([tire, rim, hub, ...spokes]);
    wheelGeoCache.rotateZ(Math.PI / 2);
  }
  return wheelGeoCache;
}

export interface CarMesh {
  group: THREE.Group;
  wheels: THREE.Mesh[];       // all 4 (animated) or empty (static)
  frontWheels: THREE.Mesh[];
  tail: THREE.MeshStandardMaterial;
  lightbar?: { red: THREE.MeshStandardMaterial; blue: THREE.MeshStandardMaterial };
}

export function wheelbaseFor(kind: BodyKind) {
  return PROFILES[kind].wu * 2;
}

export function buildCarMesh(kind: BodyKind, paint: number, opts: { police?: boolean; animatedWheels?: boolean } = {}): CarMesh {
  const p = PROFILES[kind];
  const { L, W } = p;
  const h = L / 2;
  const belt = p.wsBase[1];
  const roofY = (p.wsTop[1] + p.roofEnd[1]) / 2;
  const parts: THREE.BufferGeometry[] = [];

  // body shell with wheel arches, chassis filler behind the arches
  parts.push(extrudeProfile(bodyShape(p), W, paint, 0.05));
  parts.push(box(W - 0.5, 0.4, L - 0.4, 0, p.bottom + 0.1, 0, BLACK));
  // roof panel over the glasshouse, pillars between the side windows
  const roofLen = p.wsTop[0] - p.roofEnd[0];
  parts.push(box(W - 0.2, 0.06, roofLen - 0.06, 0, roofY + 0.02, -(p.wsTop[0] + p.roofEnd[0]) / 2, opts.police ? BLACK : paint));
  const winH = roofY - belt - 0.16;
  const winFront = p.wsBase[0] - 0.45, winRear = p.rwBase[0] + 0.12;
  const winMid = -(winFront + winRear) / 2;
  parts.push(box(W + 0.04, winH + 0.02, 0.07, 0, belt + 0.1 + winH / 2, winMid + 0.05, paint));
  // mirrors, bumpers, grille, plate, exhaust
  const mz = -(p.wsBase[0] - 0.12);
  parts.push(box(0.1, 0.09, 0.2, -(W / 2 + 0.08), belt + 0.12, mz, paint));
  parts.push(box(0.1, 0.09, 0.2, W / 2 + 0.08, belt + 0.12, mz, paint));
  parts.push(box(W + 0.02, 0.14, 0.24, 0, p.bottom + 0.06, -(h - 0.08), BLACK));
  parts.push(box(W + 0.02, 0.14, 0.24, 0, p.bottom + 0.06, h - 0.08, BLACK));
  parts.push(box(W * 0.42, 0.14, 0.05, 0, (p.bottom + p.frontTop[1]) / 2 + 0.05, -h - 0.01, BLACK));
  parts.push(box(0.42, 0.13, 0.03, 0, p.tailTop[1] - 0.36, h + 0.01, 0xe8e8e0));
  parts.push(tint(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8).rotateX(Math.PI / 2).translate(-0.5, p.bottom - 0.02, h + 0.04), 0x3a3c40));
  if (kind !== "hatch") parts.push(tint(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8).rotateX(Math.PI / 2).translate(0.5, p.bottom - 0.02, h + 0.04), 0x3a3c40));
  if (kind === "muscle") parts.push(box(0.9, 0.12, 1.3, 0, p.hoodStart[1] + 0.03, -(p.hoodStart[0] - 0.85), paint)); // hood scoop
  if (p.spoiler === "lip") parts.push(box(W - 0.3, 0.05, 0.28, 0, p.trunk[1] + 0.04, -(p.trunk[0] + 0.1), paint));
  if (p.spoiler === "wing") {
    parts.push(box(W - 0.1, 0.05, 0.4, 0, p.trunk[1] + 0.34, -(p.trunk[0] + 0.05), BLACK));
    parts.push(box(0.07, 0.34, 0.26, -0.7, p.trunk[1] + 0.16, -(p.trunk[0] + 0.05), BLACK));
    parts.push(box(0.07, 0.34, 0.26, 0.7, p.trunk[1] + 0.16, -(p.trunk[0] + 0.05), BLACK));
  }
  if (opts.police) {
    // black and white livery: black doors and hood stripe, blue beltline stripe
    parts.push(box(W + 0.02, belt - p.bottom - 0.18, 1.6, 0, (belt + p.bottom) / 2 - 0.02, 0.1, BLACK));
    parts.push(box(W + 0.03, 0.05, L * 0.62, 0, belt - 0.02, 0.15, 0x1a3fbf));
    parts.push(box(0.6, 0.03, p.hoodStart[0] - p.wsBase[0] - 0.2, 0, (p.hoodStart[1] + p.wsBase[1]) / 2 + 0.02, -(p.hoodStart[0] + p.wsBase[0]) / 2, BLACK));
    parts.push(box(1.3, 0.14, 0.36, 0, roofY + 0.12, -(p.wsTop[0] + p.roofEnd[0]) / 2 + 0.1, BLACK));
  }
  const body = new THREE.Mesh(mergeGeometries(parts), paintMaterial());
  body.castShadow = true;
  body.receiveShadow = true;
  const group = new THREE.Group();
  group.add(body);

  // glass: windshield + rear window + roof extrusion, and side window band
  if (!glassMat) glassMat = new THREE.MeshStandardMaterial({ color: GLASS_TINT, roughness: 0.08, metalness: 0.9 });
  const glassParts: THREE.BufferGeometry[] = [extrudeProfile(glassShape(p), W - 0.26, GLASS_TINT, 0)];
  glassParts.push(box(W + 0.02, winH, winFront - winRear, 0, belt + 0.1 + winH / 2, winMid, GLASS_TINT));
  const glass = new THREE.Mesh(mergeGeometries(glassParts), glassMat);
  group.add(glass);

  // lights
  if (!headMat) headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 2.2 });
  const hw = W / 2 - 0.32;
  const hy = p.frontTop[1] + 0.06, hz = -(p.frontTop[0] - 0.02);
  const head = new THREE.Mesh(mergeGeometries([box(0.42, 0.14, 0.1, -hw, hy, hz, 0xffffff), box(0.42, 0.14, 0.1, hw, hy, hz, 0xffffff)]), headMat);
  group.add(head);
  const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2010, emissiveIntensity: 0.8 });
  const ty = p.tailTop[1] - 0.12;
  const tailMesh = new THREE.Mesh(mergeGeometries([box(0.5, 0.12, 0.06, -hw, ty, h + 0.01, 0xffffff), box(0.5, 0.12, 0.06, hw, ty, h + 0.01, 0xffffff)]), tail);
  group.add(tailMesh);

  let lightbar: CarMesh["lightbar"];
  if (opts.police) {
    const red = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 0.3 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2a5cff, emissiveIntensity: 0.3 });
    const lz = -(p.wsTop[0] + p.roofEnd[0]) / 2 + 0.1;
    const rm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), red); rm.position.set(-0.34, roofY + 0.24, lz);
    const bm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), blue); bm.position.set(0.34, roofY + 0.24, lz);
    group.add(rm, bm);
    lightbar = { red, blue };
  }

  // wheels
  if (!wheelMat) wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.6 });
  const wg = wheelGeometry();
  const track = W / 2 - 0.1;
  const wheelPos = [[-track, -p.wu], [track, -p.wu], [-track, p.wu], [track, p.wu]];
  const wheels: THREE.Mesh[] = [];
  const frontWheels: THREE.Mesh[] = [];
  if (opts.animatedWheels) {
    wheelPos.forEach(([x, z], i) => {
      const w = new THREE.Mesh(wg, wheelMat!);
      w.position.set(x, WHEEL_R, z);
      w.castShadow = true;
      group.add(w);
      wheels.push(w);
      if (i < 2) frontWheels.push(w);
    });
  } else {
    const gs = wheelPos.map(([x, z]) => { const g = wg.clone(); g.translate(x, WHEEL_R, z); return g; });
    const wm = new THREE.Mesh(mergeGeometries(gs), wheelMat);
    wm.castShadow = true;
    group.add(wm);
  }
  return { group, wheels, frontWheels, tail, lightbar };
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
