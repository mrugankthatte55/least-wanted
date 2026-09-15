import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildCity } from "./city";
import { Car, PLAYER_CARS, PAINTS, collideCarBox, collideCars, buildCarMesh, BodyKind } from "./car";
import { Input } from "./input";
import { Police } from "./police";
import { Traffic } from "./traffic";
import { Race, RIVALS } from "./race";
import { Smoke } from "./particles";
import { HUD } from "./hud";
import { Menu } from "./menu";
import { sfx, unlockAudio, setVolume, updateLoops } from "./audio";
import { loadSettings, loadCareer, saveCareer, Settings, currentColorway, accentHex } from "./theme";

type Quality = "high" | "medium" | "low";
const params = new URLSearchParams(location.search);
const gfxParam = params.get("gfx") as Quality | null;
const AUTOPLAY = params.has("autoplay");
const GARAGE = params.has("garage"); // dev: line up every body style for a look, no menu // dev: drive itself and force a pursuit, for headless smoke tests
let quality: Quality = gfxParam || (localStorage.getItem("lw.gfx") as Quality) || "high";
const settings: Settings = loadSettings();
const career = loadCareer();

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.75;
renderer.domElement.className = "game";
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc98a5e, 140, 760);
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.3, 1600);
scene.add(camera);

// dusk sky + environment
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 11), THREE.MathUtils.degToRad(215));
const setSkyUniforms = (s: Sky) => {
  const u = s.material.uniforms;
  u.turbidity.value = 7;
  u.rayleigh.value = 2.4;
  u.mieCoefficient.value = 0.02;
  u.mieDirectionalG.value = 0.9;
  u.sunPosition.value.copy(sunDir);
};
const sky = new Sky();
sky.scale.setScalar(5000);
setSkyUniforms(sky);
scene.add(sky);
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(5000);
  setSkyUniforms(envSky);
  envScene.add(envSky);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
}
scene.add(new THREE.HemisphereLight(0xb9a7c9, 0x4a3a2a, 0.45));
const sun = new THREE.DirectionalLight(0xffb070, 2.4);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -70;
sun.shadow.camera.right = sun.shadow.camera.top = 70;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

const city = buildCity();
scene.add(city.group);
const smoke = new Smoke(scene, 110);
const input = new Input();
const hud = new HUD(city);
setVolume(settings.volume);

// ---------- Player ----------
let player = new Car(PLAYER_CARS[settings.car], PAINTS[settings.paint].hex, { animatedWheels: true });
scene.add(player.group);
const SPAWN = city.nodeAt(5, 6);
player.place(SPAWN.x + 2, SPAWN.z - 20, 0);

let currentPaint = settings.paint;
function rebuildPlayer() {
  const { x, z, heading, health, wrecked, nitro } = player;
  scene.remove(player.group);
  player = new Car(PLAYER_CARS[settings.car], PAINTS[settings.paint].hex, { animatedWheels: true });
  currentPaint = settings.paint;
  player.place(x, z, heading);
  player.health = health; player.wrecked = wrecked; player.nitro = nitro;
  scene.add(player.group);
}

const traffic = new Traffic(scene, city, 26);

// ---------- Post-processing / quality ----------
let composer: EffectComposer | null = null;
function applyQuality(q: Quality) {
  quality = q;
  localStorage.setItem("lw.gfx", q);
  const w = window.innerWidth, h = window.innerHeight;
  if (composer) { composer.dispose(); composer = null; }
  const shadowSize = q === "high" ? 4096 : q === "medium" ? 2048 : 1024;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  if (q === "low") return;
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.6, 0.9));
  composer.addPass(new OutputPass());
}
applyQuality(quality);

// ---------- Game state ----------
type Mode = "roam" | "race";
let mode: Mode = "roam";
let paused = true;
let started = false;
let race: Race | null = null;
let raceEndT = 0;
let bustedT = 0;
let totaledT = 0;
let resetCooldown = 0;
let crashSfxT = 0;
let showFps = false;
let fpsAcc = 0, fpsN = 0;
let clock = 0;
let menuAngle = 2.4;
const nearMissed = new Set<Car>();

const police = new Police(scene, city, smoke, (e) => {
  switch (e.kind) {
    case "pursuitStart": hud.showMessage("<em>PURSUIT</em>", "LOSE THE COPS OR GET BUSTED", 2.5); sfx.heat(); break;
    case "heat": hud.showMessage(`HEAT LEVEL <em>${e.level}</em>`, e.level >= 3 ? "ROADBLOCKS INCOMING" : "MORE UNITS RESPONDING", 2.2); sfx.heat(); break;
    case "takedown": hud.showMessage("<em>TAKEDOWN</em>", `+$${e.bounty.toLocaleString()} BOUNTY`, 1.8); sfx.takedown(); break;
    case "cooldown": hud.showMessage("<em>COOLDOWN</em>", "STAY OUT OF SIGHT", 2.2); break;
    case "backOn": hud.showMessage("<em>SPOTTED</em>", "THEY'RE BACK ON YOU", 1.8); break;
    case "roadblock": hud.showMessage("<em>ROADBLOCK</em> AHEAD", "", 1.8); sfx.horn(); break;
    case "evaded": {
      hud.showMessage("<em>EVADED</em>", `$${Math.floor(e.bounty).toLocaleString()} BOUNTY BANKED`, 4);
      sfx.evaded();
      career.evaded++; career.bountyTotal += e.bounty; career.bestBounty = Math.max(career.bestBounty, e.bounty);
      career.longestPursuit = Math.max(career.longestPursuit, e.time); saveCareer(career);
      setTimeout(() => police.reset(), 4000);
      break;
    }
    case "busted": {
      hud.showMessage("<em>BUSTED</em>", `$${Math.floor(e.bounty).toLocaleString()} BOUNTY LOST &middot; CAR IMPOUNDED`, 4, true);
      sfx.busted();
      career.busted++; saveCareer(career);
      bustedT = 4;
      break;
    }
  }
});

const menu = new Menu(settings, {
  onPlay: () => { unlockAudio(); started = true; paused = false; menu.show(false); },
  onRace: (i) => { unlockAudio(); startRace(i); },
  onSettingsChanged: (s) => {
    setVolume(s.volume);
    if (player.spec !== PLAYER_CARS[s.car] || currentPaint !== s.paint) rebuildPlayer();
  },
  onQualityChanged: (q) => applyQuality(q as Quality),
  getQuality: () => quality,
  getCareer: () => career,
  getSession: () => ({ bounty: police.bounty, heat: police.heat, inPursuit: police.state === "pursuit" || police.state === "cooldown", started }),
});

function accentCss() { return currentColorway().accent; }

function respawnPlayer() {
  const n = city.nearestNode(player.x, player.z);
  player.place(n.x, n.z, Math.round(player.heading / (Math.PI / 2)) * (Math.PI / 2));
  player.nitro = 100;
}

function startRace(i: number) {
  if (race) race.dispose();
  const def = RIVALS[i];
  police.setEnabled(false);
  race = new Race(scene, city, def, player, accentHex());
  mode = "race";
  started = true;
  paused = false;
  raceEndT = 0;
  menu.show(false);
  hud.showRacePanel(true);
  hud.showPursuitPanel(false);
  hud.showMessage(`#${def.rank} <em>${def.name}</em>`, "SPRINT &middot; HIT EVERY CHECKPOINT &middot; BEAT THEM TO THE LINE", 3.5);
}

function endRace() {
  if (!race) return;
  race.dispose();
  race = null;
  mode = "roam";
  police.setEnabled(true);
  hud.showRacePanel(false);
  hud.showPursuitPanel(true);
  hud.setCountdown(null);
}

function setPause(p: boolean) {
  paused = p;
  menu.show(p);
}

// ---------- Camera ----------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false;
function updateCamera(dt: number) {
  const fx = player.fx, fz = player.fz;
  const speed01 = Math.min(1, player.speed / 75);
  const nitro = player.nitroOn && player.nitro > 0 && player.throttle > 0 ? 1 : 0;
  if (settings.camera === "hood") {
    camera.position.set(player.x + fx * 0.6, player.y + 1.15, player.z + fz * 0.6);
    camera.lookAt(player.x + fx * 30, player.y + 0.6, player.z + fz * 30);
    camera.fov = 72 + speed01 * 14 + nitro * 6;
    camera.updateProjectionMatrix();
    return;
  }
  const back = 7.5 + speed01 * 2.2;
  const height = 3 + speed01 * 0.6;
  const target = new THREE.Vector3(player.x - fx * back, player.y + height, player.z - fz * back);
  if (!camInit) { camPos.copy(target); camInit = true; }
  camPos.lerp(target, 1 - Math.exp(-dt * 7));
  camLook.set(player.x + fx * 6, player.y + 1.1, player.z + fz * 6);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.fov = 66 + speed01 * 18 + nitro * 8;
  camera.updateProjectionMatrix();
}

function updateMenuCamera(dt: number) {
  menuAngle += dt * 0.12;
  const r = 8.5;
  camera.position.set(player.x + Math.sin(menuAngle) * r, player.y + 2.2, player.z + Math.cos(menuAngle) * r);
  camera.lookAt(player.x, player.y + 0.7, player.z);
  camera.fov = 50;
  camera.updateProjectionMatrix();
}

// ---------- Collisions ----------
function handleCollisions() {
  const cops = police.cops;
  const all: Car[] = [player, ...cops.map((c) => c.car), ...traffic.cars];
  if (race) all.push(race.rival);
  for (const car of all) {
    for (const b of city.collidersNear(car.x, car.z)) {
      const impact = collideCarBox(car, b);
      if (impact > 0) {
        car.damage(impact * (car === player ? 1.3 : 2));
        if (car === player) onPlayerImpact(impact, car.x, car.z);
      }
    }
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (Math.abs(a.x - b.x) > 8 || Math.abs(a.z - b.z) > 8) continue;
    const impact = collideCars(a, b);
    if (impact <= 0) continue;
    const other = a === player ? b : b === player ? a : null;
    if (other) {
      const cop = cops.find((c) => c.car === other);
      const isRival = other === race?.rival;
      if (cop) { police.onPlayerHitCop(cop, impact, player); player.damage(impact * 0.9); }
      else {
        player.damage(impact * 1.1);
        other.damage(impact * (isRival ? 0.7 : 2.5));
        if (police.state === "pursuit" && !isRival) police.bounty += 250;
      }
      onPlayerImpact(impact, (a.x + b.x) / 2, (a.z + b.z) / 2);
      nearMissed.add(other);
    } else {
      a.damage(impact * 1.5); b.damage(impact * 1.5);
    }
  }
}

function onPlayerImpact(impact: number, x: number, z: number) {
  if (impact < 2.5) return;
  hud.flashDamage(Math.min(0.8, impact / 25));
  if (crashSfxT <= 0) { impact > 6 ? sfx.crash(impact / 25) : sfx.bump(); crashSfxT = 0.12; }
  for (let i = 0; i < Math.min(8, impact); i++) smoke.emit(x, 0.6, z, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 0.6, 0xffc070, 0.5, 0.8);
}

function checkNearMisses() {
  for (const c of traffic.cars) {
    const dx = c.x - player.x, dz = c.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > 12) { nearMissed.delete(c); continue; }
    if (nearMissed.has(c) || c.wrecked) continue;
    const rel = Math.hypot(c.vx - player.vx, c.vz - player.vz);
    if (d < 3.6 && rel > 14) {
      nearMissed.add(c);
      player.nitro = Math.min(100, player.nitro + 12);
      if (police.state === "pursuit") police.bounty += 150;
      sfx.nearMiss();
    }
  }
}

// ---------- Main loop ----------
const three = new THREE.Clock();
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  applyQuality(quality);
});
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (menu.panelOpen) return;
    if (!started) return;
    setPause(!paused);
  }
  if (e.code === "KeyF") { showFps = !showFps; if (!showFps) hud.setFps(null); }
  if (e.code === "KeyC" && !paused) { settings.camera = settings.camera === "chase" ? "hood" : "chase"; }
  if (e.code === "Enter" && race && race.state === "finished") endRace();
});

hud.showPursuitPanel(true);
hud.showRacePanel(false);

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, three.getDelta());
  clock += dt;
  const accent = accentCss();

  if (GARAGE) {
    camera.position.set(player.x + 1.5, 2.6, player.z + 8.5);
    camera.lookAt(player.x, 0.7, player.z - 0.5);
    camera.fov = 55; camera.updateProjectionMatrix();
  } else if (paused) {
    updateMenuCamera(dt);
    traffic.update(dt, player, []);
    smoke.update(dt);
    updateLoops(dt, { rpm: 0, load: 0, skid: 0, wind: 0, nitro: 0, siren: 0, muted: true });
  } else {
    crashSfxT -= dt;
    resetCooldown -= dt;

    // player input
    const controllable = !player.wrecked && !(race && race.state === "countdown") && bustedT <= 0;
    if (controllable) {
      player.throttle = AUTOPLAY ? 1 : input.throttle;
      player.steer = AUTOPLAY ? Math.sin(clock * 0.7) : input.steer;
      player.handbrake = AUTOPLAY ? Math.sin(clock * 2) > 0.9 : input.handbrake;
      const wantNitro = input.nitro && player.nitro > 0 && input.throttle > 0;
      if (wantNitro && !player.nitroOn) sfx.nitroStart();
      player.nitroOn = wantNitro;
    } else {
      player.throttle = 0; player.steer = 0; player.nitroOn = false;
      if (bustedT > 0 || player.wrecked) player.handbrake = true;
    }
    if (input.justPressed("KeyR") && resetCooldown <= 0 && controllable) { respawnPlayer(); resetCooldown = 1.5; }

    player.update(dt, (x, z) => city.groundY(x, z));
    if (race) race.update(dt, player, (e) => e === "tick" ? sfx.countdown() : e === "go" ? sfx.go() : sfx.checkpoint());
    police.update(dt, player);
    traffic.update(dt, player, race ? [race.rival, ...police.cops.map((c) => c.car)] : police.cops.map((c) => c.car));
    handleCollisions();
    checkNearMisses();
    player.syncMesh();

    // tire smoke
    if ((player.drifting || (player.handbrake && player.speed > 6)) && !player.wrecked) {
      const rate = Math.min(1, player.slip / 12 + 0.3);
      if (Math.random() < rate * dt * 40) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const rx = -player.fz, rz = player.fx;
        const wx = player.x - player.fx * player.halfLen * 0.8 + rx * side * 0.85;
        const wz = player.z - player.fz * player.halfLen * 0.8 + rz * side * 0.85;
        smoke.emit(wx, 0.3, wz, -player.vx * 0.08 + (Math.random() - 0.5), 0.6, -player.vz * 0.08 + (Math.random() - 0.5), 1.1, 0xd8d4cc, 0.9, 0.45);
      }
    }
    if (player.wrecked && Math.random() < dt * 12) smoke.emit(player.x - player.fx, 1.1, player.z - player.fz, 0, 1.6, 0, 1.4, 0x222222, 1.5, 0.6);
    smoke.update(dt);

    // pursuit-independent wreck handling
    if (player.wrecked && police.state !== "pursuit" && police.state !== "cooldown" && bustedT <= 0) {
      if (totaledT <= 0) { totaledT = 3.5; hud.showMessage("<em>TOTALED</em>", mode === "race" ? "RACE OVER" : "TOWED BACK TO THE ROAD", 3.5, true); if (race && race.state !== "finished") { race.state = "finished"; race.result = "lose"; } }
      totaledT -= dt;
      if (totaledT <= 0) { respawnPlayer(); }
    }
    if (bustedT > 0) {
      bustedT -= dt;
      if (bustedT <= 0) { police.reset(); respawnPlayer(); }
    }

    // race results
    if (race && race.state === "finished") {
      if (raceEndT === 0) {
        if (race.result === "win") {
          const idx = RIVALS.indexOf(race.def);
          career.racesWon++; career.blacklist = Math.max(career.blacklist, idx + 1); saveCareer(career);
          const cleared = career.blacklist >= 5;
          hud.showMessage("<em>YOU WIN</em>", cleared ? "BLACKLIST CLEARED &middot; YOU ARE OFFICIALLY THE LEAST WANTED" : `#${race.def.rank} ${race.def.name} BEATEN &middot; ESC &rarr; BLACKLIST FOR THE NEXT ONE`, 6);
          sfx.win();
        } else if (!player.wrecked) {
          career.racesLost++; saveCareer(career);
          hud.showMessage("<em>YOU LOSE</em>", `${race.def.name} TOOK IT &middot; ESC &rarr; BLACKLIST TO RETRY`, 6, true);
          sfx.lose();
        }
      }
      raceEndT += dt;
      if (raceEndT > 7) endRace();
    }

    // career stats
    if (player.kmh > career.topSpeed) { career.topSpeed = player.kmh; if (Math.floor(clock) % 5 === 0) saveCareer(career); }
    if ((police.state === "pursuit" || police.state === "cooldown") && police.pursuitTime > career.longestPursuit) career.longestPursuit = police.pursuitTime;

    updateCamera(dt);

    // audio
    const gear = hud.drawSpeedo(player.kmh, player.nitro, player.nitroOn && player.nitro > 0 && player.throttle > 0, accent);
    void gear;
    updateLoops(dt, {
      rpm: player.wrecked ? 0 : hud.rpm(player.kmh) * 0.85 + (player.throttle > 0 ? 0.15 : 0.05),
      load: player.throttle > 0 ? 1 : 0.15,
      skid: player.drifting || (player.handbrake && player.speed > 6) ? Math.min(1, player.slip / 10 + 0.3) : 0,
      wind: Math.min(1, player.speed / 80),
      nitro: player.nitroOn && player.nitro > 0 && player.throttle > 0 ? 1 : 0,
      siren: police.sirenIntensity(),
      muted: false,
    });
  }

  // sun follows the player so shadows stay crisp nearby
  sun.position.set(player.x + sunDir.x * 150, sunDir.y * 150, player.z + sunDir.z * 150);
  sun.target.position.set(player.x, 0, player.z);

  // HUD
  hud.update(dt);
  hud.setVitals(player.spec.name, player.health);
  hud.setPursuit(police.state, police.heat, police.bounty, police.evade, police.bustedMeter, police.pursuitTime);
  if (race) {
    hud.setRace(race.position(player), race.playerIdx, race.total, race.time, race.def.name);
    hud.setCountdown(race.state === "countdown" ? Math.ceil(race.countdown) : (race.state === "running" && race.time < 0.8 ? 0 : null));
  }
  const racing = race && race.state !== "finished" ? race : null;
  hud.drawMinimap({ player, cops: police.cops, rival: race?.rival, checkpoint: racing?.nextCheckpoint, route: racing?.remaining }, accent);
  if (showFps) { fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { hud.setFps(Math.round(fpsN / fpsAcc)); fpsAcc = 0; fpsN = 0; } }

  if (composer) composer.render(); else renderer.render(scene, camera);
  input.endFrame();
}

menu.show(true);
if (GARAGE) {
  const row: [BodyKind, number, boolean][] = [["hatch", PAINTS[1].hex, false], ["muscle", PAINTS[2].hex, false], ["exotic", PAINTS[4].hex, false], ["sedan", 0xf2f2f2, true]];
  row.forEach(([k, c, police], i) => {
    const m = buildCarMesh(k, c, { police });
    m.group.position.set(player.x - 5.5 + i * 3.6, 0, player.z - i * 0.4);
    m.group.rotation.y = params.get("garage") === "rear" ? 0.75 : Math.PI - 0.75;
    scene.add(m.group);
  });
  scene.remove(player.group);
  menu.show(false);
  document.querySelector("#hud")!.classList.add("hidden");
}
if (AUTOPLAY) {
  started = true; paused = false; menu.show(false);
  setTimeout(() => police.startPursuit(), 1500);
  setTimeout(() => { police.heat = 3; }, 2500);
  setTimeout(() => startRace(0), params.has("race") ? 300 : 6000);
  window.addEventListener("error", (e) => console.error("AUTOPLAY ERROR", e.message));
}
frame();
