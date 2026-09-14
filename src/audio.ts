// Procedural audio via WebAudio: engine, siren, tire squeal and one-shots. No sound files.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let volume = 0.6;

interface Loops {
  engOsc1: OscillatorNode; engOsc2: OscillatorNode; engFilter: BiquadFilterNode; engGain: GainNode;
  sirenOsc: OscillatorNode; sirenGain: GainNode;
  skidSrc: AudioBufferSourceNode; skidFilter: BiquadFilterNode; skidGain: GainNode;
  windGain: GainNode;
  nitroGain: GainNode;
}
let loops: Loops | null = null;
let sirenPhase = 0;

function ensure(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    buildLoops(ctx);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function buildLoops(c: AudioContext) {
  const noiseSrc = () => { const s = c.createBufferSource(); s.buffer = noiseBuffer!; s.loop = true; s.start(); return s; };
  // engine: two detuned oscillators through a lowpass
  const engOsc1 = c.createOscillator(); engOsc1.type = "sawtooth";
  const engOsc2 = c.createOscillator(); engOsc2.type = "square";
  const engFilter = c.createBiquadFilter(); engFilter.type = "lowpass"; engFilter.frequency.value = 600; engFilter.Q.value = 2;
  const engGain = c.createGain(); engGain.gain.value = 0;
  const o2g = c.createGain(); o2g.gain.value = 0.35;
  engOsc1.connect(engFilter); engOsc2.connect(o2g).connect(engFilter); engFilter.connect(engGain).connect(master!);
  engOsc1.start(); engOsc2.start();
  // siren
  const sirenOsc = c.createOscillator(); sirenOsc.type = "triangle"; sirenOsc.frequency.value = 700;
  const sirenGain = c.createGain(); sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain).connect(master!); sirenOsc.start();
  // skid: bandpassed noise
  const skidSrc = noiseSrc();
  const skidFilter = c.createBiquadFilter(); skidFilter.type = "bandpass"; skidFilter.frequency.value = 1800; skidFilter.Q.value = 4;
  const skidGain = c.createGain(); skidGain.gain.value = 0;
  skidSrc.connect(skidFilter).connect(skidGain).connect(master!);
  // wind
  const windSrc = noiseSrc();
  const windFilter = c.createBiquadFilter(); windFilter.type = "lowpass"; windFilter.frequency.value = 500;
  const windGain = c.createGain(); windGain.gain.value = 0;
  windSrc.connect(windFilter).connect(windGain).connect(master!);
  // nitro hiss
  const nitroSrc = noiseSrc();
  const nitroFilter = c.createBiquadFilter(); nitroFilter.type = "highpass"; nitroFilter.frequency.value = 3000;
  const nitroGain = c.createGain(); nitroGain.gain.value = 0;
  nitroSrc.connect(nitroFilter).connect(nitroGain).connect(master!);
  loops = { engOsc1, engOsc2, engFilter, engGain, sirenOsc, sirenGain, skidSrc, skidFilter, skidGain, windGain, nitroGain };
}

export function unlockAudio() { ensure(); }

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
}

const smooth = (p: AudioParam, v: number, t = 0.05) => { p.setTargetAtTime(v, ctx!.currentTime, t); };

/** Continuous sounds, call once per frame. All values 0..1 unless noted. */
export function updateLoops(dt: number, s: { rpm: number; load: number; skid: number; wind: number; nitro: number; siren: number; muted: boolean }) {
  if (!loops || !ctx) return;
  const m = s.muted ? 0 : 1;
  const f = 55 + s.rpm * 240;
  smooth(loops.engOsc1.frequency, f);
  smooth(loops.engOsc2.frequency, f * 0.5 + 1.5);
  smooth(loops.engFilter.frequency, 350 + s.rpm * 2400 + s.load * 600);
  smooth(loops.engGain.gain, m * (0.05 + s.load * 0.09 + s.rpm * 0.04));
  smooth(loops.skidGain.gain, m * s.skid * 0.22);
  smooth(loops.skidFilter.frequency, 1400 + s.skid * 900);
  smooth(loops.windGain.gain, m * s.wind * s.wind * 0.18);
  smooth(loops.nitroGain.gain, m * s.nitro * 0.12);
  sirenPhase += dt;
  const wail = 0.5 + 0.5 * Math.sin(sirenPhase * Math.PI * 2 * 0.55);
  smooth(loops.sirenOsc.frequency, 620 + wail * 520, 0.02);
  smooth(loops.sirenGain.gain, m * s.siren * 0.11);
}

function noise(duration: number, gain: number, filterFreq: number, filterQ = 1, type: BiquadFilterType = "lowpass") {
  const c = ensure();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer!;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  filter.Q.value = filterQ;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  src.connect(filter).connect(g).connect(master!);
  src.start();
  src.stop(c.currentTime + duration);
}

function tone(freq: number, duration: number, gain: number, type: OscillatorType = "sine", slideTo?: number) {
  const c = ensure();
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + duration);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  o.connect(g).connect(master!);
  o.start();
  o.stop(c.currentTime + duration);
}

export const sfx = {
  crash(intensity: number) {
    const v = Math.min(1, intensity);
    noise(0.25 + v * 0.3, 0.5 + v * 0.6, 900 + v * 800, 0.7);
    noise(0.12, 0.4 * v, 5000, 0.5, "highpass");
    tone(90, 0.25, 0.5 * v, "triangle", 40);
  },
  bump() { noise(0.08, 0.25, 700); },
  checkpoint() { tone(880, 0.09, 0.3, "square"); setTimeout(() => tone(1320, 0.12, 0.3, "square"), 80); },
  countdown() { tone(440, 0.18, 0.35, "square"); },
  go() { tone(880, 0.45, 0.4, "square"); },
  takedown() { tone(300, 0.2, 0.35, "sawtooth", 80); setTimeout(() => noise(0.4, 0.5, 600), 60); },
  busted() { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => tone(f, 0.45, 0.35, "sawtooth"), i * 220)); },
  evaded() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.3, "square"), i * 120)); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.3, 0.32, "square"), i * 110)); },
  lose() { [400, 350, 300, 200].forEach((f, i) => setTimeout(() => tone(f, 0.3, 0.32, "sawtooth"), i * 150)); },
  heat() { tone(200, 0.3, 0.4, "sawtooth", 400); setTimeout(() => tone(400, 0.3, 0.35, "sawtooth", 800), 120); },
  nitroStart() { noise(0.3, 0.35, 4000, 0.5, "highpass"); },
  nearMiss() { noise(0.18, 0.3, 1200, 0.5, "highpass"); },
  horn() { tone(370, 0.35, 0.25, "sawtooth"); tone(466, 0.35, 0.25, "sawtooth"); },
  click() { tone(1200, 0.03, 0.15, "square"); },
};
