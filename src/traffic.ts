import * as THREE from "three";
import { Car, TRAFFIC_SPEC, CIVILIAN_COLORS } from "./car";
import { City, LANES } from "./city";
import { AIState, newAI, driveTowards, headingTo } from "./ai";

interface Civ { car: Car; ai: AIState; prev: number; next: number; lane: number; cruise: number; wreckT: number; }

export class Traffic {
  civs: Civ[] = [];
  get cars() { return this.civs.map((c) => c.car); }

  constructor(private scene: THREE.Scene, private city: City, count: number) {
    for (let i = 0; i < count; i++) {
      const car = new Car(TRAFFIC_SPEC, CIVILIAN_COLORS[Math.floor(Math.random() * CIVILIAN_COLORS.length)]);
      scene.add(car.group);
      const civ: Civ = { car, ai: newAI(), prev: 0, next: 0, lane: 2, cruise: 14 + Math.random() * 8, wreckT: 0 };
      this.civs.push(civ);
      this.respawn(civ, 0, 0, 40, 500);
    }
  }

  private respawn(c: Civ, px: number, pz: number, min: number, max: number) {
    let nodes = this.city.nodesNear(px, pz, min, max);
    if (!nodes.length) nodes = this.city.nodes;
    const n = nodes[Math.floor(Math.random() * nodes.length)];
    c.prev = n.id;
    c.next = this.city.randomNeighbor(n.id, -1);
    c.lane = LANES[Math.floor(Math.random() * LANES.length)];
    const b = this.city.nodes[c.next];
    const dx = b.x - n.x, dz = b.z - n.z; const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const t = 10 + Math.random() * (len - 20);
    c.car.place(n.x + ux * t + (-uz) * c.lane, n.z + uz * t + ux * c.lane, headingTo(n.x, n.z, b.x, b.z));
    c.car.mesh.tail.emissiveIntensity = 0.8;
    c.wreckT = 0;
  }

  update(dt: number, player: Car, others: Car[]) {
    const city = this.city;
    for (const c of this.civs) {
      const car = c.car;
      const dPlayer = Math.hypot(car.x - player.x, car.z - player.z);
      if (car.wrecked) {
        c.wreckT += dt;
        car.throttle = 0; car.handbrake = true;
        if (c.wreckT > 10 || dPlayer > 420) this.respawn(c, player.x, player.z, 150, 320);
        car.update(dt, (x, z) => city.groundY(x, z));
        continue;
      }
      if (dPlayer > 420) { this.respawn(c, player.x, player.z, 150, 320); continue; }

      const a = city.nodes[c.prev], b = city.nodes[c.next];
      let dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const rx = -dz, rz = dx;
      const along = (car.x - a.x) * dx + (car.z - a.z) * dz;
      if (along > len - 7) { const n = city.continueFrom(c.prev, c.next, 0.6); c.prev = c.next; c.next = n; }
      const tx = b.x + rx * c.lane - dx * 4, tz = b.z + rz * c.lane - dz * 4;

      // brake for cars ahead
      let desired = c.cruise;
      const check = (o: Car) => {
        if (o === car) return;
        const ox = o.x - car.x, oz = o.z - car.z;
        const ahead = ox * car.fx + oz * car.fz;
        const side = Math.abs(ox * -car.fz + oz * car.fx);
        if (ahead > 0 && ahead < 18 && side < 2.6) desired = Math.min(desired, ahead < 7 ? 0 : (ahead - 5) * 1.6);
      };
      for (const o of this.civs) if (Math.abs(o.car.x - car.x) < 20 && Math.abs(o.car.z - car.z) < 20) check(o.car);
      if (dPlayer < 20) check(player);
      for (const o of others) if (Math.abs(o.x - car.x) < 20 && Math.abs(o.z - car.z) < 20) check(o);

      driveTowards(car, tx, tz, desired, city, c.ai, dt);
      car.update(dt, (x, z) => city.groundY(x, z));
    }
  }
}
