import { Car } from "./car";
import { City } from "./city";

export interface AIState {
  stuck: number;
  reverse: number;
}
export const newAI = (): AIState => ({ stuck: 0, reverse: 0 });

export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const headingTo = (fromX: number, fromZ: number, toX: number, toZ: number) => Math.atan2(-(toX - fromX), -(toZ - fromZ));

const OFFSETS = [0, -0.3, 0.3, -0.65, 0.65, -1.05, 1.05, -1.5, 1.5];

/** Steer `car` toward a point, avoiding buildings with a fan of probes. Sets throttle/steer on the car. */
export function driveTowards(car: Car, tx: number, tz: number, desiredSpeed: number, city: City, ai: AIState, dt: number) {
  const vF = car.forwardSpeed;
  const speed = Math.abs(vF);
  const want = headingTo(car.x, car.z, tx, tz);
  const reach = 6 + speed * 0.9;

  if (ai.reverse > 0) {
    ai.reverse -= dt;
    car.throttle = -1;
    car.steer = -Math.sign(wrapAngle(want - car.heading)) || 1;
    car.handbrake = false;
    return;
  }

  // pick the least-deviating unblocked heading
  let best = want;
  let found = false;
  for (const off of OFFSETS) {
    const h = want + off;
    const dx = -Math.sin(h), dz = -Math.cos(h);
    let ok = true;
    for (const f of [0.3, 0.6, 1]) {
      if (city.pointBlocked(car.x + dx * reach * f, car.z + dz * reach * f, 1.6)) { ok = false; break; }
    }
    if (ok) { best = h; found = true; break; }
  }
  const ang = wrapAngle(best - car.heading);
  car.steer = Math.max(-1, Math.min(1, ang * 2.2));

  // slow down for corners and for walls straight ahead
  let target = desiredSpeed * (1 - Math.min(1, Math.abs(ang) / 1.1) * 0.7);
  const fx = car.fx, fz = car.fz;
  for (const d of [8, 14, 22, 32, 44]) {
    if (city.pointBlocked(car.x + fx * d, car.z + fz * d, 1.2)) { target = Math.min(target, 3 + d * 0.55); break; }
  }
  if (!found) target = Math.min(target, 4);

  if (vF < target - 1) car.throttle = 1;
  else if (vF > target + 3) car.throttle = -1;
  else car.throttle = 0.15;
  car.handbrake = false;

  // unstick
  if (car.throttle > 0 && speed < 0.8) ai.stuck += dt; else ai.stuck = 0;
  if (ai.stuck > 1.1) { ai.stuck = 0; ai.reverse = 1.0 + Math.random() * 0.6; }
}
