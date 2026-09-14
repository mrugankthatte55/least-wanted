import * as THREE from "three";

/** Deterministic RNG so the city is the same every visit. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function finish(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 16m x 16m road tile: two lanes each way, U axis runs along the road. */
export function roadTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const rng = mulberry32(11);
  ctx.fillStyle = "#2b2b2f";
  ctx.fillRect(0, 0, S, S);
  grain(ctx, S, S, rng, 26);
  // edge lines
  ctx.fillStyle = "#cfcfc8";
  ctx.fillRect(0, 22, S, 4);
  ctx.fillRect(0, S - 26, S, 4);
  // dashed lane dividers
  for (let x = 0; x < S; x += 192) {
    ctx.fillRect(x, 126, 96, 4);
    ctx.fillRect(x, S - 130, 96, 4);
  }
  // double yellow center
  ctx.fillStyle = "#d9b23a";
  ctx.fillRect(0, S / 2 - 8, S, 4);
  ctx.fillRect(0, S / 2 + 4, S, 4);
  // tar patches
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let i = 0; i < 12; i++) {
    const x = rng() * S, y = rng() * S;
    ctx.beginPath(); ctx.ellipse(x, y, 8 + rng() * 30, 2 + rng() * 4, rng() * 3, 0, Math.PI * 2); ctx.fill();
  }
  return finish(c);
}

export function asphaltTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = "#2b2b2f";
  ctx.fillRect(0, 0, S, S);
  grain(ctx, S, S, mulberry32(12), 24);
  return finish(c);
}

export function concreteTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = "#8f8d86";
  ctx.fillRect(0, 0, S, S);
  grain(ctx, S, S, mulberry32(13), 20);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= S; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }
  return finish(c);
}

export function groundTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = "#3d3a30";
  ctx.fillRect(0, 0, S, S);
  grain(ctx, S, S, mulberry32(14), 30);
  return finish(c);
}

export function grassTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = "#3f5a2c";
  ctx.fillRect(0, 0, S, S);
  const rng = mulberry32(15);
  grain(ctx, S, S, rng, 34);
  ctx.fillStyle = "rgba(90,120,50,0.5)";
  for (let i = 0; i < 300; i++) ctx.fillRect(rng() * S, rng() * S, 2, 3);
  return finish(c);
}

export function roofTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = "#3a3a3e";
  ctx.fillRect(0, 0, S, S);
  const rng = mulberry32(16);
  grain(ctx, S, S, rng, 22);
  ctx.fillStyle = "#4a4a4f";
  for (let i = 0; i < 6; i++) ctx.fillRect(rng() * S, rng() * S, 20 + rng() * 30, 20 + rng() * 30);
  return finish(c);
}

/** Facade tile: 8 x 8 windows, each cell is 4m. Returns diffuse + emissive maps. */
export function windowTextures() {
  const S = 512, cell = 64;
  const [c, ctx] = makeCanvas(S, S);
  const [e, ectx] = makeCanvas(S, S);
  const rng = mulberry32(17);
  ctx.fillStyle = "#b9b5ad";
  ctx.fillRect(0, 0, S, S);
  grain(ctx, S, S, rng, 18);
  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, S, S);
  // floor ledges
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  for (let y = 0; y < S; y += cell) ctx.fillRect(0, y + cell - 4, S, 4);
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const x = gx * cell + 12, y = gy * cell + 8, w = 40, h = 40;
      const lit = rng() < 0.42;
      // frame
      ctx.fillStyle = "#55534f";
      ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
      if (lit) {
        const warm = rng() < 0.75;
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, warm ? "#ffe2a8" : "#cfe6ff");
        g.addColorStop(1, warm ? "#f0b860" : "#9cc4ff");
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ectx.fillStyle = warm ? "#ffd58a" : "#bcd8ff";
        ectx.fillRect(x, y, w, h);
        if (rng() < 0.5) { // blinds / partial
          ectx.fillStyle = "rgba(0,0,0,0.5)";
          ectx.fillRect(x, y, w, h * rng() * 0.6);
        }
      } else {
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, "#2a3442");
        g.addColorStop(1, "#141a24");
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x + 4, y + 4, w * 0.4, h * 0.35);
      }
      // mullion
      ctx.fillStyle = "#3a3936";
      ctx.fillRect(x + w / 2 - 1, y, 2, h);
      ectx.fillStyle = "#000";
      ectx.fillRect(x + w / 2 - 1, y, 2, h);
    }
  }
  return { map: finish(c), emissiveMap: finish(e) };
}

export function smokeTexture() {
  const S = 64;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.5, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
