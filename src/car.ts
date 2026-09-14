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

const GLASS = 0x0d1117;
const BLACK = 0x111215;

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

let paintMatCache: THREE.MeshStandardMaterial | null = null;
function paintMaterial() {
  if (!paintMatCache) paintMatCache = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32 });
  return paintMatCache;
}
let wheelGeo: THREE.BufferGeometry | null = null;
let wheelMat: THREE.MeshStandardMaterial | null = null;
let headMat: THREE.MeshStandardMaterial | null = null;

export interface CarMesh {
  group: THREE.Group;
  wheels: THREE.Mesh[];       // all 4 (animated) or empty (static)
  frontWheels: THREE.Mesh[];
  tail: THREE.MeshStandardMaterial;
  lightbar?: { red: THREE.MeshStandardMaterial; blue: THREE.MeshStandardMaterial };
}

export function wheelbaseFor(kind: BodyKind) {
  return kind === "hatch" ? 2.5 : kind === "muscle" ? 2.95 : kind === "exotic" ? 2.7 : 2.85;
}

export function buildCarMesh(kind: BodyKind, paint: number, opts: { police?: boolean; animatedWheels?: boolean } = {}): CarMesh {
  const parts: THREE.BufferGeometry[] = [];
  const wb = wheelbaseFor(kind);
  // front is -z
  if (kind === "hatch") {
    parts.push(box(1.8, 0.5, 3.9, 0, 0.55, 0, paint));
    parts.push(box(1.65, 0.5, 2.2, 0, 1.03, 0.25, GLASS));
    parts.push(box(1.7, 0.1, 2.3, 0, 1.3, 0.25, paint));
    parts.push(box(1.84, 0.2, 0.3, 0, 0.42, -1.95, BLACK));
    parts.push(box(1.84, 0.2, 0.3, 0, 0.42, 1.95, BLACK));
  } else if (kind === "muscle") {
    parts.push(box(1.95, 0.52, 4.9, 0, 0.56, 0, paint));
    parts.push(box(0.9, 0.12, 1.6, 0, 0.86, -1.3, paint));
    parts.push(box(1.7, 0.48, 2.0, 0, 1.06, 0.4, GLASS));
    parts.push(box(1.74, 0.08, 1.9, 0, 1.33, 0.4, paint));
    parts.push(box(1.98, 0.22, 0.3, 0, 0.42, -2.45, BLACK));
    parts.push(box(1.98, 0.22, 0.3, 0, 0.42, 2.45, BLACK));
  } else if (kind === "exotic") {
    parts.push(box(2.0, 0.4, 4.5, 0, 0.5, 0, paint));
    parts.push(box(1.9, 0.18, 1.4, 0, 0.78, -1.5, paint));
    parts.push(box(1.6, 0.42, 1.9, 0, 0.9, 0.15, GLASS));
    parts.push(box(1.7, 0.08, 1.2, 0, 1.14, 0.5, paint));
    parts.push(box(1.9, 0.06, 0.4, 0, 1.15, 2.0, BLACK));
    parts.push(box(0.08, 0.4, 0.3, -0.7, 0.92, 2.0, BLACK));
    parts.push(box(0.08, 0.4, 0.3, 0.7, 0.92, 2.0, BLACK));
    parts.push(box(2.02, 0.18, 0.3, 0, 0.38, -2.25, BLACK));
  } else {
    // sedan (police / traffic)
    parts.push(box(1.9, 0.52, 4.7, 0, 0.56, 0, paint));
    parts.push(box(1.7, 0.52, 2.1, 0, 1.06, 0.2, GLASS));
    parts.push(box(1.74, 0.08, 2.0, 0, 1.36, 0.2, opts.police ? BLACK : paint));
    parts.push(box(1.94, 0.22, 0.3, 0, 0.42, -2.35, BLACK));
    parts.push(box(1.94, 0.22, 0.3, 0, 0.42, 2.35, BLACK));
    if (opts.police) {
      parts.push(box(1.92, 0.54, 1.5, 0, 0.56, -1.6, BLACK));
      parts.push(box(1.92, 0.54, 1.2, 0, 0.56, 1.75, BLACK));
      parts.push(box(1.2, 0.12, 0.34, 0, 1.46, -0.1, BLACK));
    }
  }
  const body = new THREE.Mesh(mergeGeometries(parts), paintMaterial());
  body.castShadow = true;
  body.receiveShadow = true;
  const group = new THREE.Group();
  group.add(body);

  // lights
  if (!headMat) headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 2.2 });
  const frontZ = kind === "muscle" ? -2.46 : kind === "hatch" ? -1.96 : kind === "exotic" ? -2.26 : -2.36;
  const rearZ = -frontZ;
  const hw = kind === "exotic" ? 0.72 : 0.66;
  const head = new THREE.Mesh(mergeGeometries([box(0.42, 0.16, 0.06, -hw, 0.66, frontZ, 0xffffff), box(0.42, 0.16, 0.06, hw, 0.66, frontZ, 0xffffff)]), headMat);
  group.add(head);
  const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2010, emissiveIntensity: 0.8 });
  const tailMesh = new THREE.Mesh(mergeGeometries([box(0.5, 0.14, 0.06, -hw, 0.66, rearZ, 0xffffff), box(0.5, 0.14, 0.06, hw, 0.66, rearZ, 0xffffff)]), tail);
  group.add(tailMesh);

  let lightbar: CarMesh["lightbar"];
  if (opts.police) {
    const red = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 0.3 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2a5cff, emissiveIntensity: 0.3 });
    const rm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), red); rm.position.set(-0.32, 1.6, -0.1);
    const bm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), blue); bm.position.set(0.32, 1.6, -0.1);
    group.add(rm, bm);
    lightbar = { red, blue };
  }

  // wheels
  if (!wheelGeo) { wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14); wheelGeo.rotateZ(Math.PI / 2); }
  if (!wheelMat) wheelMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9, metalness: 0.2 });
  const track = kind === "exotic" || kind === "muscle" ? 0.9 : 0.82;
  const wheelPos = [[-track, -wb / 2], [track, -wb / 2], [-track, wb / 2], [track, wb / 2]];
  const wheels: THREE.Mesh[] = [];
  const frontWheels: THREE.Mesh[] = [];
  if (opts.animatedWheels) {
    wheelPos.forEach(([x, z], i) => {
      const w = new THREE.Mesh(wheelGeo!, wheelMat!);
      w.position.set(x, 0.34, z);
      w.castShadow = true;
      group.add(w);
      wheels.push(w);
      if (i < 2) frontWheels.push(w);
    });
  } else {
    const gs = wheelPos.map(([x, z]) => { const g = wheelGeo!.clone(); g.translate(x, 0.34, z); return g; });
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
