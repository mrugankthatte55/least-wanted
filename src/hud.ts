import { City, HALF, N, SPACING, ROAD_W, BLOCK_W } from "./city";
import { Car } from "./car";
import { Cop } from "./police";
import { PursuitState } from "./police";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export interface MapMarkers {
  player: Car;
  cops: Cop[];
  rival?: Car;
  checkpoint?: { x: number; z: number };
}

export class HUD {
  private gauge = $("#gauge") as HTMLCanvasElement;
  private gctx = this.gauge.getContext("2d")!;
  private minimap = $("#minimap") as HTMLCanvasElement;
  private mctx = this.minimap.getContext("2d")!;
  private mapImage: HTMLCanvasElement;
  private message = $("#message");
  private messageTimer = 0;
  private damageEl = $("#damage");
  private damageFlash = 0;
  private lastGear = 1;

  constructor(city: City) {
    this.mapImage = this.buildMap(city);
  }

  private buildMap(city: City) {
    const S = 1024;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#101216";
    ctx.fillRect(0, 0, S, S);
    const toPx = (v: number) => v + S / 2;
    // blocks
    for (let bj = 0; bj < N - 1; bj++) for (let bi = 0; bi < N - 1; bi++) {
      const kind = city.blockKinds[bj][bi];
      const bx = (bi - (N - 1) / 2) * SPACING + SPACING / 2, bz = (bj - (N - 1) / 2) * SPACING + SPACING / 2;
      ctx.fillStyle = kind === "park" ? "#1e3320" : kind === "lot" ? "#1a1c22" : kind === "tower" ? "#2a2d36" : "#22252c";
      ctx.fillRect(toPx(bx - BLOCK_W / 2), toPx(bz - BLOCK_W / 2), BLOCK_W, BLOCK_W);
    }
    // roads
    ctx.strokeStyle = "#565a66";
    ctx.lineWidth = ROAD_W * 0.8;
    ctx.lineCap = "square";
    for (const n of city.nodes) {
      for (const l of n.links) {
        if (l < n.id) continue;
        const m = city.nodes[l];
        ctx.beginPath(); ctx.moveTo(toPx(n.x), toPx(n.z)); ctx.lineTo(toPx(m.x), toPx(m.z)); ctx.stroke();
      }
    }
    ctx.strokeStyle = "#8b8f9a";
    ctx.lineWidth = 3;
    ctx.strokeRect(toPx(-HALF - ROAD_W / 2), toPx(-HALF - ROAD_W / 2), 2 * HALF + ROAD_W, 2 * HALF + ROAD_W);
    return c;
  }

  drawMinimap(m: MapMarkers, accent: string) {
    const ctx = this.mctx, W = 176, view = 320;
    const p = m.player;
    ctx.clearRect(0, 0, W, W);
    const sx = p.x + 512 - view / 2, sz = p.z + 512 - view / 2;
    ctx.drawImage(this.mapImage, sx, sz, view, view, 0, 0, W, W);
    const k = W / view;
    const tx = (x: number) => (x - p.x) * k + W / 2;
    const tz = (z: number) => (z - p.z) * k + W / 2;
    if (m.checkpoint) {
      ctx.strokeStyle = accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tx(m.checkpoint.x), tz(m.checkpoint.z), 6, 0, Math.PI * 2); ctx.stroke();
      // direction hint at the edge if off-screen
      const dx = m.checkpoint.x - p.x, dz = m.checkpoint.z - p.z;
      if (Math.abs(dx) > view / 2 || Math.abs(dz) > view / 2) {
        const a = Math.atan2(dz, dx);
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * 80, W / 2 + Math.sin(a) * 80, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const c of m.cops) {
      if (c.mode === "wrecked") continue;
      ctx.fillStyle = c.mode === "patrol" ? "#9ab4ff" : (Math.floor(performance.now() / 150) % 2 ? "#ff3b3b" : "#3f7dff");
      ctx.beginPath(); ctx.arc(tx(c.car.x), tz(c.car.z), 3.5, 0, Math.PI * 2); ctx.fill();
    }
    if (m.rival) {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(tx(m.rival.x), tz(m.rival.z), 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(-p.heading);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /** Returns the current gear for engine audio. */
  drawSpeedo(kmh: number, nitro: number, nitroActive: boolean, accent: string): number {
    const ctx = this.gctx, W = 440, H = 260;
    ctx.clearRect(0, 0, W, H);
    const cx = 220, cy = 190, R = 160;
    const a0 = Math.PI * 0.85, a1 = Math.PI * 2.15;
    const max = 320;
    const ang = (v: number) => a0 + (a1 - a0) * Math.min(1, v / max);
    ctx.lineWidth = 12; ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, ang(kmh)); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "500 18px 'Barlow Condensed', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let v = 0; v <= max; v += 40) {
      const a = ang(v);
      const x1 = cx + Math.cos(a) * (R - 16), y1 = cy + Math.sin(a) * (R - 16);
      const x2 = cx + Math.cos(a) * (R - 26), y2 = cy + Math.sin(a) * (R - 26);
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.fillText(String(v), cx + Math.cos(a) * (R - 46), cy + Math.sin(a) * (R - 46));
    }
    // needle
    const a = ang(kmh);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30); ctx.lineTo(cx + Math.cos(a) * (R - 30), cy + Math.sin(a) * (R - 30)); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "700 64px 'Barlow Condensed', sans-serif";
    ctx.fillText(String(Math.round(kmh)), cx, cy - 4);
    ctx.font = "500 16px 'Barlow Condensed', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("KM/H", cx, cy + 34);
    const tops = [0, 45, 85, 130, 185, 250, 400];
    let gear = 1;
    while (gear < 6 && kmh >= tops[gear]) gear++;
    this.lastGear = gear;
    ctx.fillStyle = accent;
    ctx.font = "700 34px 'Barlow Condensed', sans-serif";
    ctx.fillText(kmh < 2 ? "N" : String(gear), cx, cy + 66);
    const nb = $("#nitro");
    (nb.querySelector(".bar i") as HTMLElement).style.width = `${nitro}%`;
    nb.classList.toggle("active", nitroActive);
    $("#nitroVignette").style.opacity = nitroActive ? "1" : "0";
    return gear;
  }

  /** 0..1 rpm proxy from the speed inside the current gear. */
  rpm(kmh: number) {
    const tops = [0, 45, 85, 130, 185, 250, 400];
    const g = this.lastGear;
    return Math.max(0, Math.min(1, (kmh - tops[g - 1]) / (tops[g] - tops[g - 1])));
  }

  setPursuit(state: PursuitState, heat: number, bounty: number, evade: number, busted: number, time: number) {
    const el = $("#pursuit");
    el.querySelectorAll(".heat i").forEach((s, i) => s.classList.toggle("on", i < heat));
    (el.querySelector(".bounty span") as HTMLElement).textContent = `$${Math.floor(bounty).toLocaleString()}`;
    const st = el.querySelector(".state") as HTMLElement;
    st.textContent = state === "pursuit" ? "PURSUIT" : state === "cooldown" ? "COOLDOWN" : state === "busted" ? "BUSTED" : state === "evaded" ? "EVADED" : "";
    st.classList.toggle("cool", state === "cooldown");
    const active = state !== "idle";
    (el.querySelector(".meter") as HTMLElement).style.visibility = active ? "visible" : "hidden";
    (el.querySelector(".bust i") as HTMLElement).style.width = `${busted * 100}%`;
    (el.querySelector(".evade i") as HTMLElement).style.width = `${evade * 100}%`;
    const m = Math.floor(time / 60), s = Math.floor(time % 60);
    (el.querySelector(".ptime") as HTMLElement).textContent = active ? `PURSUIT TIME ${m}:${s.toString().padStart(2, "0")}` : "DRIVE FAST NEAR THE COPS TO START A PURSUIT";
  }

  showPursuitPanel(on: boolean) { $("#pursuit").classList.toggle("hidden", !on); }
  showRacePanel(on: boolean) { $("#race").classList.toggle("hidden", !on); }

  setRace(pos: number, cp: number, total: number, time: number, rival: string) {
    const el = $("#race");
    const pb = el.querySelector(".pos b") as HTMLElement;
    pb.textContent = pos === 1 ? "1ST" : "2ND";
    pb.classList.toggle("behind", pos !== 1);
    (el.querySelector(".cp b") as HTMLElement).textContent = `${cp} / ${total}`;
    const m = Math.floor(time / 60), s = (time % 60).toFixed(1).padStart(4, "0");
    (el.querySelector(".time b") as HTMLElement).textContent = `${m}:${s}`;
    (el.querySelector(".rival b") as HTMLElement).textContent = rival;
  }

  setCountdown(n: number | null) {
    const el = $("#countdown");
    el.classList.toggle("hidden", n === null);
    if (n !== null) el.textContent = n > 0 ? String(n) : "GO";
  }

  setVitals(name: string, health: number) {
    const el = $("#vitals");
    (el.querySelector(".car") as HTMLElement).textContent = name;
    (el.querySelector(".dmg .bar i") as HTMLElement).style.width = `${health}%`;
    (el.querySelector(".dmg") as HTMLElement).classList.toggle("low", health < 30);
  }

  flashDamage(amount: number) { this.damageFlash = Math.min(1, this.damageFlash + amount); }

  showMessage(html: string, sub = "", seconds = 2.5, bad = false) {
    this.message.innerHTML = html + (sub ? `<small>${sub}</small>` : "");
    this.message.classList.toggle("bad", bad);
    this.message.style.opacity = "1";
    this.messageTimer = seconds;
  }
  hideMessage() { this.messageTimer = 0; this.message.style.opacity = "0"; }

  setFps(fps: number | null) { $("#fps").textContent = fps === null ? "" : `${fps} FPS`; }

  update(dt: number) {
    if (this.messageTimer > 0) { this.messageTimer -= dt; if (this.messageTimer <= 0) this.message.style.opacity = "0"; }
    if (this.damageFlash > 0) { this.damageFlash = Math.max(0, this.damageFlash - dt * 2); this.damageEl.style.opacity = String(this.damageFlash); }
  }
}
