import * as THREE from "three";
import { Car, PLAYER_CARS } from "./car";
import { City, RoadNode } from "./city";
import { AIState, newAI, driveTowards, headingTo } from "./ai";

export interface Rival { rank: number; name: string; car: number; paint: number; speed: number; blurb: string; }

export const RIVALS: Rival[] = [
  { rank: 5, name: "SNAIL", car: 0, paint: 0x6b8e5a, speed: 0.62, blurb: "Drives like his mom is watching. She is. She's in the passenger seat." },
  { rank: 4, name: "GRANDPA JOE", car: 1, paint: 0x8c7a5b, speed: 0.72, blurb: "Left turn signal has been on since 2004. Still faster than you." },
  { rank: 3, name: "KAREN", car: 2, paint: 0xeceff1, speed: 0.8, blurb: "Would like to speak to the manager of this race. Then win it." },
  { rank: 2, name: "MILDLY FAST MIKE", car: 1, paint: 0x2a6df0, speed: 0.9, blurb: "Fast. Mildly. Which in this town makes him a legend." },
  { rank: 1, name: "RAZOR-ISH", car: 2, paint: 0x1b1f2a, speed: 1.0, blurb: "The least wanted driver in Rockport-adjacent. Beat him and nobody will care." },
];

export type RaceState = "countdown" | "running" | "finished";

export class Race {
  state: RaceState = "countdown";
  countdown = 3;
  time = 0;
  result: "win" | "lose" | null = null;
  checkpoints: RoadNode[] = [];
  playerIdx = 0;
  rivalIdx = 0;
  rival: Car;
  private ai: AIState = newAI();
  private marker: THREE.Mesh;
  private marker2: THREE.Mesh;
  private segLen: number[] = [];
  private cum: number[] = [];
  private lastTick = 4;

  constructor(private scene: THREE.Scene, private city: City, public def: Rival, player: Car, accent: number) {
    // route: random walk with a straight-line bias, no revisits
    const start = city.nearestNode(player.x, player.z);
    const path = [start.id];
    let prev = -1, cur = start.id;
    for (let k = 0; k < 11; k++) {
      let next = -1;
      for (let tries = 0; tries < 6; tries++) {
        const cand = prev === -1 ? city.randomNeighbor(cur, -1) : city.continueFrom(prev, cur, 0.6);
        if (!path.includes(cand)) { next = cand; break; }
      }
      if (next === -1) {
        const opts = city.nodes[cur].links.filter((l) => !path.includes(l));
        if (!opts.length) break;
        next = opts[Math.floor(Math.random() * opts.length)];
      }
      path.push(next); prev = cur; cur = next;
    }
    this.checkpoints = path.slice(1).map((id) => city.nodes[id]);
    let acc = 0;
    let px = start.x, pz = start.z;
    for (const c of this.checkpoints) { const l = Math.hypot(c.x - px, c.z - pz); this.segLen.push(l); this.cum.push(acc); acc += l; px = c.x; pz = c.z; }

    // grid the cars at the start line
    const first = this.checkpoints[0];
    const h = headingTo(start.x, start.z, first.x, first.z);
    const fx = -Math.sin(h), fz = -Math.cos(h);
    const rx = -fz, rz = fx;
    player.place(start.x - rx * 3 + fx * 2, start.z - rz * 3 + fz * 2, h);
    const spec = PLAYER_CARS[def.car];
    this.rival = new Car(spec, def.paint);
    this.rival.place(start.x + rx * 3 - fx * 2, start.z + rz * 3 - fz * 2, h);
    scene.add(this.rival.group);

    const geo = new THREE.CylinderGeometry(7, 7, 60, 28, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker2 = new THREE.Mesh(geo, mat.clone());
    (this.marker2.material as THREE.MeshBasicMaterial).opacity = 0.1;
    scene.add(this.marker, this.marker2);
    this.placeMarkers();
  }

  get total() { return this.checkpoints.length; }
  get nextCheckpoint() { return this.checkpoints[Math.min(this.playerIdx, this.total - 1)]; }

  private placeMarkers() {
    const a = this.checkpoints[Math.min(this.playerIdx, this.total - 1)];
    const b = this.checkpoints[Math.min(this.playerIdx + 1, this.total - 1)];
    this.marker.position.set(a.x, 30, a.z);
    this.marker2.position.set(b.x, 30, b.z);
    this.marker2.visible = this.playerIdx + 1 < this.total;
    const finish = this.playerIdx >= this.total - 1;
    (this.marker.material as THREE.MeshBasicMaterial).color.setHex(finish ? 0xffffff : (this.marker2.material as THREE.MeshBasicMaterial).color.getHex());
  }

  private progress(car: Car, idx: number) {
    if (idx >= this.total) return this.cum[this.total - 1] + this.segLen[this.total - 1];
    const c = this.checkpoints[idx];
    const d = Math.hypot(c.x - car.x, c.z - car.z);
    return this.cum[idx] + Math.max(0, this.segLen[idx] - d);
  }

  /** 1 if the player leads, else 2. */
  position(player: Car) {
    return this.progress(player, this.playerIdx) >= this.progress(this.rival, this.rivalIdx) ? 1 : 2;
  }

  /** Returns events for the HUD: "tick" (countdown beep), "go", "checkpoint", "finish". */
  update(dt: number, player: Car, sfx: (e: "tick" | "go" | "checkpoint") => void): void {
    this.marker.rotation.y += dt * 0.5;
    this.marker2.rotation.y -= dt * 0.5;
    if (this.state === "countdown") {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n < this.lastTick && n > 0) { this.lastTick = n; sfx("tick"); }
      player.throttle = 0; player.handbrake = true;
      this.rival.throttle = 0; this.rival.handbrake = true;
      if (this.countdown <= 0) { this.state = "running"; sfx("go"); }
    }
    if (this.state === "running") {
      this.time += dt;
      const cp = this.checkpoints[this.playerIdx];
      if (Math.hypot(cp.x - player.x, cp.z - player.z) < 12 + player.speed * 0.08) {
        this.playerIdx++;
        if (this.playerIdx >= this.total) { this.state = "finished"; this.result = this.rivalIdx >= this.total ? "lose" : "win"; }
        else { sfx("checkpoint"); this.placeMarkers(); }
      }
      // rival with rubber band
      const rcp = this.checkpoints[Math.min(this.rivalIdx, this.total - 1)];
      if (this.rivalIdx < this.total && Math.hypot(rcp.x - this.rival.x, rcp.z - this.rival.z) < 15) {
        this.rivalIdx++;
        if (this.rivalIdx >= this.total && this.state === "running") { this.state = "finished"; this.result = "lose"; }
      }
      const gap = this.progress(this.rival, this.rivalIdx) - this.progress(player, this.playerIdx);
      const band = Math.max(0.78, Math.min(1.15, 1 - gap / 260 * 0.3));
      const spec = PLAYER_CARS[this.def.car];
      const target = this.checkpoints[Math.min(this.rivalIdx, this.total - 1)];
      if (this.rivalIdx < this.total) driveTowards(this.rival, target.x, target.z, spec.maxSpeed * this.def.speed * band, this.city, this.ai, dt);
      else { this.rival.throttle = 0; this.rival.handbrake = true; }
      this.rival.nitroOn = this.rival.nitro > 30 && Math.abs(this.rival.steer) < 0.3 && this.def.speed >= 0.8;
    }
    if (this.state === "finished") {
      this.rival.throttle = 0; this.rival.handbrake = true;
    }
    this.rival.update(dt, (x, z) => this.city.groundY(x, z));
  }

  dispose() {
    this.scene.remove(this.rival.group, this.marker, this.marker2);
  }
}
