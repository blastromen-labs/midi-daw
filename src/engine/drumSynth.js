let ctx = null;

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export async function resumeAudio() {
  const c = getCtx();
  if (c.state === 'suspended') await c.resume();
  return c;
}

function env(node, t, attack, decay, sustain, release, peak = 1) {
  const g = node.gain;
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + attack);
  g.linearRampToValueAtTime(sustain * peak, t + attack + decay);
  g.setValueAtTime(sustain * peak, t + attack + decay + 0.001);
  g.linearRampToValueAtTime(0, t + attack + decay + release);
}

export function playKick(time, velocity = 100) {
  const c = getCtx();
  const vol = velocity / 127;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
  env(gain, time, 0.001, 0.08, 0, 0.3, vol);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(time);
  osc.stop(time + 0.5);
}

export function playSnare(time, velocity = 100) {
  const c = getCtx();
  const vol = velocity / 127;
  const len = 512;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const noise = c.createBufferSource();
  noise.buffer = buf;
  const ng = c.createGain();
  const filt = c.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = 1000;
  env(ng, time, 0.001, 0.05, 0, 0.15, vol * 0.8);
  noise.connect(filt);
  filt.connect(ng);
  ng.connect(c.destination);
  noise.start(time);
  noise.stop(time + 0.2);

  const tone = c.createOscillator();
  const tg = c.createGain();
  tone.type = 'triangle';
  tone.frequency.value = 200;
  env(tg, time, 0.001, 0.03, 0, 0.1, vol * 0.4);
  tone.connect(tg);
  tg.connect(c.destination);
  tone.start(time);
  tone.stop(time + 0.15);
}

export function playHiHat(time, velocity = 100, open = false) {
  const c = getCtx();
  const vol = velocity / 127;
  const len = 4096;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const noise = c.createBufferSource();
  noise.buffer = buf;
  const ng = c.createGain();
  const filt = c.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = 7000;
  const decay = open ? 0.3 : 0.04;
  env(ng, time, 0.001, decay, 0, 0.01, vol * 0.5);
  noise.connect(filt);
  filt.connect(ng);
  ng.connect(c.destination);
  noise.start(time);
  noise.stop(time + decay + 0.05);
}

export function playClap(time, velocity = 100) {
  const c = getCtx();
  const vol = velocity / 127;
  for (let burst = 0; burst < 3; burst++) {
    const t = time + burst * 0.012;
    const len = 256;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const ng = c.createGain();
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1500;
    filt.Q.value = 0.5;
    env(ng, t, 0.001, 0.04, 0, 0.08, vol * 0.6);
    noise.connect(filt);
    filt.connect(ng);
    ng.connect(c.destination);
    noise.start(t);
    noise.stop(t + 0.15);
  }
}

const DRUM_PLAYERS = {
  kick: playKick,
  snare: playSnare,
  hihat: playHiHat,
  clap: playClap,
};

export function playDrum(type, time, velocity = 100) {
  const fn = DRUM_PLAYERS[type];
  if (fn) fn(time, velocity);
}
