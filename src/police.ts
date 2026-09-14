import * as THREE from "three";
import { Car, POLICE_SPEC } from "./car";
import { City, LANES } from "./city";
import { AIState, newAI, driveTowards, headingTo } from "./ai";
import { Smoke } from "./particles";

export type PursuitState = "idle" | "pursuit" | "cooldown" | "busted" | "evaded";
export const HEAT_COPS = [0, 2, 3, 4, 6, 8];
export const HEAT_SPEED = [0, 50, 56, 63, 71, 80];
const HEAT_TIMES = [0, 0, 40, 95, 160, 240];
const PATROL_COUNT = 2;

export type CopMode = "patrol" | "chase" | "block" | "wrecked";

export class Cop {
  car: Car;
  ai: AIState = newAI();
  mode: CopMode = "patrol";
  prev = 0; next = 0; lane = 2;
  wreckTimer = 0;
  blink = Math.random();
  constructor() {
    this.car = new Car(POLICE_SPEC, 0xf2f2f2, { police: true });
  }
}

export type PoliceEvent =
  | { kind: "pursuitStart" } | { kind: "heat"; level: number } | { kind: "takedown"; bounty: number }
  | { kind: "cooldown" } | { kind: "evaded"; bounty: number; time: number } | { kind: "busted"; bounty: number }
  | { kind: "roadblock" } | { kind: "backOn" };

export class Police {
  cops: Cop[] = [];
  state: PursuitState = "idle";
  heat = 1;
  bounty = 0;
  pursuitTime = 0;
  evade = 0;
  bustedMeter = 0;
  copsWrecked = 0;
  enabled = true;
  private cooldownT = 0;
  private spawnT = 0;
  private roadblockT = 20;
  private lastKnownX = 0; private lastKnownZ = 0;
  private endT = 0;

  constructor(private scene: THREE.Scene, private city: City, private smoke: Smoke, private onEvent: (e: PoliceEvent) => void) {}

  get nearestDistance() {
    let d = Infinity;
    for (const c of this.cops) if (c.mode !== "wrecked" && c.mode !== "block") d = Math.min(d, Math.hypot(c.car.x - this.px, c.car.z - this.pz));
    return d;
  }
  private px = 0; private pz = 0;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) { this.clear(); this.state = "idle"; this.bounty = 0; this.heat = 1; this.pursuitTime = 0; }
  }

  clear() {
    for (const c of this.cops) this.scene.remove(c.car.group);
    this.cops = [];
  }

  reset() {
    this.clear();
    this.state = "idle";
    this.heat = 1; this.bounty = 0; this.pursuitTime = 0; this.evade = 0; this.bustedMeter = 0; this.copsWrecked = 0;
    this.roadblockT = 20;
  }

  /** Called by the collision loop when the player touches a cop. */
  onPlayerHitCop(cop: Cop, impact: number, player: Car) {
    if (cop.mode === "wrecked") return;
    if (cop.mode === "block") cop.mode = "chase";
    if (this.state === "idle") this.startPursuit();
    if (this.state === "cooldown") { this.state = "pursuit"; this.evade = 0.3; this.onEvent({ kind: "backOn" }); }
    // player rams do extra damage to cops, cops ram the player back via the shared collision impulse
    if (impact > 3) cop.car.damage(impact * (player.spec.mass / 1400) * 2.2);
  }

  startPursuit() {
    if (!this.enabled || this.state === "pursuit") return;
    this.state = "pursuit";
    this.evade = 0; this.bustedMeter = 0;
    for (const c of this.cops) {
      if (c.mode === "patrol") c.mode = "chase";
      c.car.spec = { ...POLICE_SPEC, maxSpeed: HEAT_SPEED[this.heat] };
    }
    this.onEvent({ kind: "pursuitStart" });
  }

  private spawnCop(player: Car, mode: CopMode, x?: number, z?: number, heading?: number) {
    const cop = new Cop();
    cop.mode = mode;
    if (x === undefined) {
      let nodes = this.city.nodesNear(player.x, player.z, 110, 240).filter((n) => {
        const dx = n.x - player.x, dz = n.z - player.z; const d = Math.hypot(dx, dz) || 1;
        return (dx / d) * player.fx + (dz / d) * player.fz < 0.35;
      });
      if (!nodes.length) nodes = this.city.nodesNear(player.x, player.z, 80, 300);
      if (!nodes.length) nodes = this.city.nodes;
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      cop.prev = n.id; cop.next = this.city.randomNeighbor(n.id, -1);
      cop.lane = LANES[Math.floor(Math.random() * LANES.length)];
      cop.car.place(n.x, n.z, mode === "patrol" ? headingTo(n.x, n.z, this.city.nodes[cop.next].x, this.city.nodes[cop.next].z) : headingTo(n.x, n.z, player.x, player.z));
    } else cop.car.place(x, z!, heading ?? 0);
    cop.car.spec = { ...POLICE_SPEC, maxSpeed: this.state === "idle" ? 30 : HEAT_SPEED[this.heat] };
    this.scene.add(cop.car.group);
    this.cops.push(cop);
    return cop;
  }

  private spawnRoadblock(player: Car) {
    const ahead = this.city.nodesNear(player.x, player.z, 130, 230).filter((n) => {
      const dx = n.x - player.x, dz = n.z - player.z; const d = Math.hypot(dx, dz) || 1;
      return (dx / d) * player.fx + (dz / d) * player.fz > 0.75;
    });
    if (!ahead.length) return false;
    const n = ahead[Math.floor(Math.random() * ahead.length)];
    const dx = n.x - player.x, dz = n.z - player.z; const d = Math.hypot(dx, dz) || 1;
    const ax = dx / d, az = dz / d;
    const px = -az, pz = ax;
    const facing = Math.atan2(-px, -pz);
    for (const off of [-5.2, 0, 5.2]) this.spawnCop(player, "block", n.x + px * off, n.z + pz * off, facing);
    this.onEvent({ kind: "roadblock" });
    return true;
  }

  update(dt: number, player: Car) {
    this.px = player.x; this.pz = player.z;
    if (!this.enabled) return;
    const st = this.state;

    if (st === "busted" || st === "evaded") {
      this.endT -= dt;
      for (const c of this.cops) this.tickCop(c, dt, player, st === "busted");
      return;
    }

    // maintain population
    const alive = this.cops.filter((c) => c.mode !== "wrecked" && c.mode !== "block").length;
    const want = st === "idle" ? PATROL_COUNT : HEAT_COPS[this.heat];
    this.spawnT -= dt;
    if (alive < want && this.spawnT <= 0) {
      this.spawnCop(player, st === "idle" ? "patrol" : "chase");
      this.spawnT = st === "idle" ? 1 : 2.2;
    }

    if (st === "idle") {
      // detection: speeding near a patrol car
      for (const c of this.cops) {
        const d = Math.hypot(c.car.x - player.x, c.car.z - player.z);
        if (d < 42 && player.speed > 25) { this.startPursuit(); break; }
      }
    }

    if (this.state === "pursuit") {
      this.pursuitTime += dt;
      const newHeat = Math.min(5, Math.max(this.heat, HEAT_TIMES.filter((t) => this.pursuitTime >= t).length - 1 + Math.floor(this.copsWrecked / 3)));
      if (newHeat > this.heat) {
        this.heat = newHeat;
        for (const c of this.cops) c.car.spec = { ...POLICE_SPEC, maxSpeed: HEAT_SPEED[this.heat] };
        this.onEvent({ kind: "heat", level: this.heat });
      }
      this.bounty += dt * (90 * this.heat + player.speed * 0.6);
      this.lastKnownX = player.x; this.lastKnownZ = player.z;

      const near = this.nearestDistance;
      if (near > 75) { this.evade = Math.min(1, this.evade + dt * (near > 150 ? 0.24 : 0.11)); }
      else if (near < 45) this.evade = Math.max(0, this.evade - dt * 0.18);
      if (player.speed < 7 && near < 15) this.bustedMeter = Math.min(1, this.bustedMeter + dt * 0.36);
      else this.bustedMeter = Math.max(0, this.bustedMeter - dt * 0.45);
      if (player.wrecked) this.bustedMeter = Math.min(1, this.bustedMeter + dt * 0.6);

      if (this.heat >= 3) {
        this.roadblockT -= dt;
        if (this.roadblockT <= 0) { this.spawnRoadblock(player); this.roadblockT = 26 - this.heat * 2 + Math.random() * 6; }
      }

      if (this.evade >= 1) { this.state = "cooldown"; this.cooldownT = 8; this.onEvent({ kind: "cooldown" }); }
      else if (this.bustedMeter >= 1) { this.state = "busted"; this.endT = 4; this.onEvent({ kind: "busted", bounty: this.bounty }); }
    } else if (this.state === "cooldown") {
      this.cooldownT -= dt;
      this.pursuitTime += dt;
      const near = this.nearestDistance;
      if (near < 55) { this.state = "pursuit"; this.evade = 0.35; this.onEvent({ kind: "backOn" }); }
      else if (this.cooldownT <= 0) { this.state = "evaded"; this.endT = 4; this.onEvent({ kind: "evaded", bounty: this.bounty, time: this.pursuitTime }); }
    }

    for (const c of this.cops) this.tickCop(c, dt, player, false);
    // cull wrecks and far cops
    this.cops = this.cops.filter((c) => {
      const d = Math.hypot(c.car.x - player.x, c.car.z - player.z);
      const drop = (c.mode === "wrecked" && c.wreckTimer <= 0) || (c.mode !== "wrecked" && d > 520) || (c.mode === "block" && d > 400);
      if (drop) this.scene.remove(c.car.group);
      return !drop;
    });
  }

  private tickCop(c: Cop, dt: number, player: Car, holding: boolean) {
    const car = c.car;
    if (car.wrecked && c.mode !== "wrecked") {
      c.mode = "wrecked";
      c.wreckTimer = 7;
      c.car.mesh.lightbar!.red.emissiveIntensity = 0;
      c.car.mesh.lightbar!.blue.emissiveIntensity = 0;
      if (this.state === "pursuit" || this.state === "cooldown") {
        this.copsWrecked++;
        const b = 1500 * this.heat;
        this.bounty += b;
        this.onEvent({ kind: "takedown", bounty: b });
      }
    }
    if (c.mode === "wrecked") {
      c.wreckTimer -= dt;
      if (Math.random() < dt * 14) this.smoke.emit(car.x + (Math.random() - 0.5), 1 + Math.random() * 0.5, car.z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6, 1.4, 0x222222, 1.6, 0.6);
      car.throttle = 0; car.steer = 0; car.handbrake = true;
    } else if (holding) {
      car.throttle = 0; car.steer = 0; car.handbrake = true;
    } else if (c.mode === "patrol") {
      this.followRoad(c, 17, dt);
    } else if (c.mode === "block") {
      car.throttle = 0; car.handbrake = true; car.steer = 0;
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < 22 && (player.fx * (car.x - player.x) + player.fz * (car.z - player.z)) < 0) c.mode = "chase";
    } else {
      // chase: aim ahead of the player, ram when close
      const chasingGhost = this.state === "cooldown";
      const tx = chasingGhost ? this.lastKnownX : player.x, tz = chasingGhost ? this.lastKnownZ : player.z;
      const d = Math.hypot(car.x - tx, car.z - tz);
      const lead = chasingGhost ? 0 : Math.min(1.1, d / 60);
      const ax = tx + player.vx * lead, az = tz + player.vz * lead;
      const desired = d < 14 ? car.spec.maxSpeed : Math.min(car.spec.maxSpeed, player.speed + 18 + d * 0.3);
      driveTowards(car, ax, az, desired, this.city, c.ai, dt);
      if (d < 12 && !chasingGhost) { car.throttle = 1; }
      if (chasingGhost && d < 12) { car.throttle = 0; }
    }
    // lightbar
    c.blink += dt;
    if (c.mode !== "wrecked" && c.mode !== "patrol") {
      const phase = Math.floor(c.blink / 0.11) % 2;
      car.mesh.lightbar!.red.emissiveIntensity = phase ? 4 : 0.15;
      car.mesh.lightbar!.blue.emissiveIntensity = phase ? 0.15 : 4;
    } else if (c.mode === "patrol") {
      car.mesh.lightbar!.red.emissiveIntensity = 0.4;
      car.mesh.lightbar!.blue.emissiveIntensity = 0.4;
    }
    car.update(dt, (x, z) => this.city.groundY(x, z));
  }

  followRoad(c: Cop, speed: number, dt: number) {
    const city = this.city;
    const a = city.nodes[c.prev], b = city.nodes[c.next];
    let dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const rx = -dz, rz = dx;
    const along = (c.car.x - a.x) * dx + (c.car.z - a.z) * dz;
    if (along > len - 7) {
      const n = city.continueFrom(c.prev, c.next, 0.6);
      c.prev = c.next; c.next = n;
    }
    const tx = b.x + rx * c.lane - dx * 4, tz = b.z + rz * c.lane - dz * 4;
    driveTowards(c.car, tx, tz, speed, city, c.ai, dt);
  }

  sirenIntensity() {
    if (this.state === "idle" || this.state === "evaded") return 0;
    const d = this.nearestDistance;
    return Math.max(0, Math.min(1, 1 - d / 220));
  }
}
