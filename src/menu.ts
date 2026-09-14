import { COLORWAYS, Career, Settings, applyColorway, currentColorway, saveSettings } from "./theme";
import { PLAYER_CARS, PAINTS } from "./car";
import { RIVALS } from "./race";

export interface MenuHooks {
  onPlay: () => void;
  onRace: (rivalIndex: number) => void;
  onSettingsChanged: (s: Settings) => void;
  onQualityChanged: (q: string) => void;
  getQuality: () => string;
  getCareer: () => Career;
  getSession: () => { bounty: number; heat: number; inPursuit: boolean; started: boolean };
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const money = (n: number) => `$${Math.floor(n).toLocaleString()}`;

export class Menu {
  private root = $("#menu");
  private panel = $("#panel");
  private stats = $("#menuStats");
  private colorwayName = $("#colorwayName");
  private open: string | null = null;

  constructor(private settings: Settings, private hooks: MenuHooks) {
    applyColorway(currentColorway());
    this.colorwayName.textContent = currentColorway().name;
    this.root.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
      if (!btn) return;
      const action = btn.dataset.action!;
      if (action === "play") hooks.onPlay();
      else if (action === "close") this.closePanel();
      else this.showPanel(action);
    });
    $("#colorwayBtn").addEventListener("click", () => {
      const cur = currentColorway();
      const i = COLORWAYS.findIndex((c) => c.id === cur.id);
      const next = COLORWAYS[(i + 1) % COLORWAYS.length];
      applyColorway(next);
      this.colorwayName.textContent = next.name;
      if (this.open === "settings") this.showPanel("settings");
    });
    window.addEventListener("keydown", (e) => { if (e.code === "Escape" && this.open) { this.closePanel(); e.stopImmediatePropagation(); } });
  }

  get panelOpen() { return this.open !== null; }

  show(visible: boolean, openPanel?: string) {
    this.root.classList.toggle("hidden", !visible);
    $("#hud").classList.toggle("hidden", visible);
    if (visible) {
      const s = this.hooks.getSession();
      const c = this.hooks.getCareer();
      const next = RIVALS[c.blacklist];
      this.stats.innerHTML = (s.inPursuit ? `PURSUIT IN PROGRESS &nbsp; <b>${money(s.bounty)}</b> BOUNTY &nbsp; HEAT <b>${s.heat}</b><br>` : "") +
        `CAREER &nbsp; <b>${money(c.bountyTotal)}</b> BOUNTY &nbsp; <b>${c.evaded}</b> EVADED &nbsp; <b>${c.busted}</b> BUSTED<br>` +
        (next ? `NEXT ON THE BLACKLIST &nbsp; <b>#${next.rank} ${next.name}</b>` : `BLACKLIST <b>CLEARED</b> &nbsp; NOBODY WANTS YOU`);
      $("#playBtn").textContent = s.started ? "RESUME" : "FREE ROAM";
      if (openPanel) this.showPanel(openPanel); else this.closePanel();
    } else this.closePanel();
  }

  private closePanel() {
    this.panel.classList.add("hidden");
    this.panel.innerHTML = "";
    this.open = null;
    for (const b of this.root.querySelectorAll(".stack button")) b.classList.remove("active");
  }

  private showPanel(kind: string) {
    this.open = kind;
    for (const b of this.root.querySelectorAll<HTMLElement>(".stack button")) b.classList.toggle("active", b.dataset.action === kind);
    const head = (title: string, sub: string) =>
      `<button class="close" data-action="close">CLOSE &times;</button><h2>${title}</h2><div class="sub">${sub}</div>`;
    const bar = (label: string, v: number) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`;
    let html = "";
    const c = this.hooks.getCareer();
    if (kind === "garage") {
      html = head("<em>GARAGE</em>", "PICK A CAR &middot; ALL THREE ARE PAID OFF, ALLEGEDLY") + `<div class="cards">` +
        PLAYER_CARS.map((car, i) =>
          `<div class="card${this.settings.car === i ? " selected" : ""}" data-car="${i}"><svg><use href="#ic-${car.body}"/></svg><h3>${car.name}</h3><div class="desc">${car.desc}</div>` +
          bar("TOP SPEED", car.stats[0]) + bar("ACCEL", car.stats[1]) + bar("HANDLING", car.stats[2]) + bar("NITRO", car.stats[3]) + `</div>`).join("") +
        `</div><div class="paint-row"><label>PAINT</label><div class="swatches">${PAINTS.map((p, i) => `<button data-paint="${i}" class="${this.settings.paint === i ? "selected" : ""}" style="background:#${p.hex.toString(16).padStart(6, "0")}" title="${p.name}"></button>`).join("")}</div></div>`;
    } else if (kind === "blacklist") {
      html = head("<em>BLACKLIST</em>", "FIVE DRIVERS NOBODY IS LOOKING FOR &middot; BEAT THEM IN ORDER") + `<div class="rivals">` +
        [...RIVALS].reverse().map((r) => {
          const idx = RIVALS.indexOf(r);
          const status = idx < c.blacklist ? "beaten" : idx === c.blacklist ? "next" : "locked";
          const label = status === "beaten" ? "BEATEN &middot; REMATCH" : status === "next" ? "RACE &rarr;" : "LOCKED";
          return `<div class="rival ${status}" data-rival="${idx}"><div class="rank">#${r.rank}</div><div><h3>${r.name}</h3><div class="desc">${r.blurb} &middot; Drives a ${PLAYER_CARS[r.car].name}.</div></div><div class="status">${label}</div></div>`;
        }).join("") + `</div>`;
    } else if (kind === "records") {
      const rows = [
        ["TOTAL BOUNTY", money(c.bountyTotal)], ["BEST PURSUIT BOUNTY", money(c.bestBounty)], ["PURSUITS EVADED", c.evaded], ["TIMES BUSTED", c.busted],
        ["COPS WRECKED", c.copsWrecked], ["LONGEST PURSUIT", `${Math.floor(c.longestPursuit / 60)}:${Math.floor(c.longestPursuit % 60).toString().padStart(2, "0")}`],
        ["BLACKLIST BEATEN", `${c.blacklist} / 5`], ["RACES W / L", `${c.racesWon} / ${c.racesLost}`], ["TOP SPEED", `${Math.round(c.topSpeed)} KM/H`],
      ];
      const rank = c.blacklist >= 5 ? "LEAST WANTED" : c.bountyTotal >= 500000 ? "PUBLIC NUISANCE" : c.bountyTotal >= 150000 ? "MENACE" : c.bountyTotal >= 40000 ? "SPEEDER" : c.bountyTotal > 0 ? "JAYWALKER" : "UNKNOWN";
      html = head("<em>RECORDS</em>", `WANTED STATUS &middot; <b style="color:var(--accent)">${rank}</b> &middot; STORED IN THIS BROWSER`) +
        `<div class="kv">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>`;
    } else if (kind === "controls") {
      const keys: [string, string][] = [
        ["W / ↑", "Accelerate"], ["S / ↓", "Brake / Reverse"], ["A D / ← →", "Steer"], ["Space", "Handbrake (drift)"],
        ["Shift", "Nitrous"], ["C", "Camera"], ["R", "Reset car"], ["Esc", "Menu / pause"], ["F", "Show FPS"], ["Enter", "Skip results"],
      ];
      html = head("<em>CONTROLS</em>", "KEYBOARD") + `<div class="keys">${keys.map(([k, v]) => `<div><span>${v}</span><kbd>${k}</kbd></div>`).join("")}</div>`;
    } else if (kind === "settings") {
      const q = this.hooks.getQuality();
      html = head("<em>SETTINGS</em>", "SAVED IN THIS BROWSER") +
        `<div class="setting"><label>MASTER VOLUME</label><input type="range" id="setVol" min="0" max="1" step="0.05" value="${this.settings.volume}"><span class="val" id="volVal">${Math.round(this.settings.volume * 100)}%</span></div>` +
        `<div class="setting"><label>GRAPHICS</label><select id="setQuality"><option value="high"${q === "high" ? " selected" : ""}>High &middot; bloom + 4K shadows</option><option value="medium"${q === "medium" ? " selected" : ""}>Medium &middot; bloom</option><option value="low"${q === "low" ? " selected" : ""}>Low</option></select><span></span></div>` +
        `<div class="setting"><label>CAMERA</label><select id="setCamera"><option value="chase"${this.settings.camera === "chase" ? " selected" : ""}>Chase</option><option value="hood"${this.settings.camera === "hood" ? " selected" : ""}>Hood</option></select><span></span></div>` +
        `<div class="setting"><label>COLORWAY</label><div class="swatches">${COLORWAYS.map((cw) => `<button data-colorway="${cw.id}" class="${currentColorway().id === cw.id ? "selected" : ""}" style="background:${cw.accent}" title="${cw.name}"></button>`).join("")}</div><span></span></div>`;
    }
    this.panel.innerHTML = html;
    this.panel.classList.remove("hidden");

    this.panel.querySelectorAll<HTMLElement>("[data-car]").forEach((card) => card.addEventListener("click", () => {
      this.settings.car = Number(card.dataset.car);
      saveSettings(this.settings); this.hooks.onSettingsChanged(this.settings); this.showPanel("garage");
    }));
    this.panel.querySelectorAll<HTMLElement>("[data-paint]").forEach((b) => b.addEventListener("click", () => {
      this.settings.paint = Number(b.dataset.paint);
      saveSettings(this.settings); this.hooks.onSettingsChanged(this.settings); this.showPanel("garage");
    }));
    this.panel.querySelectorAll<HTMLElement>(".rival.next, .rival.beaten").forEach((r) => r.addEventListener("click", () => this.hooks.onRace(Number(r.dataset.rival))));
    const vol = this.panel.querySelector<HTMLInputElement>("#setVol");
    vol?.addEventListener("input", () => {
      this.settings.volume = Number(vol.value);
      $("#volVal").textContent = `${Math.round(this.settings.volume * 100)}%`;
      saveSettings(this.settings); this.hooks.onSettingsChanged(this.settings);
    });
    this.panel.querySelector<HTMLSelectElement>("#setQuality")?.addEventListener("change", (e) => this.hooks.onQualityChanged((e.target as HTMLSelectElement).value));
    this.panel.querySelector<HTMLSelectElement>("#setCamera")?.addEventListener("change", (e) => {
      this.settings.camera = (e.target as HTMLSelectElement).value as Settings["camera"];
      saveSettings(this.settings); this.hooks.onSettingsChanged(this.settings);
    });
    this.panel.querySelectorAll<HTMLElement>("[data-colorway]").forEach((b) => b.addEventListener("click", () => {
      const cw = COLORWAYS.find((x) => x.id === b.dataset.colorway)!;
      applyColorway(cw);
      this.colorwayName.textContent = cw.name;
      this.hooks.onSettingsChanged(this.settings);
      this.showPanel("settings");
    }));
  }
}
