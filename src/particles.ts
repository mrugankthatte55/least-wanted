import * as THREE from "three";
import { smokeTexture } from "./textures";

interface P { sprite: THREE.Sprite; life: number; max: number; vx: number; vy: number; vz: number; size: number; alpha: number; }

export class Smoke {
  private pool: P[] = [];
  private next = 0;

  constructor(scene: THREE.Scene, count = 90) {
    const tex = smokeTexture();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.pool.push({ sprite: s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1, alpha: 0.5 });
    }
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, color: number, life: number, alpha = 0.55) {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    p.sprite.visible = true;
    p.sprite.position.set(x, y, z);
    (p.sprite.material as THREE.SpriteMaterial).color.setHex(color);
    p.life = life; p.max = life; p.vx = vx; p.vy = vy; p.vz = vz; p.size = size; p.alpha = alpha;
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      const t = 1 - p.life / p.max;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.vx *= 0.97; p.vz *= 0.97;
      const s = p.size * (0.5 + t * 1.6);
      p.sprite.scale.set(s, s, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = p.alpha * (1 - t) * (1 - t);
    }
  }
}
