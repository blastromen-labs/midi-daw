// Drum-track sample engine: loads user-provided audio files and plays them
// back as one-shots. Replaces the old built-in synthesized drum sounds
// (drumSynth.js) now that drum tracks are sample-based piano-roll channels.
//
// Decoded AudioBuffers are engine-only state, keyed by pad id, and are never
// stored on the reactive project (see createDrumPad in models/project.js) —
// mirrors how midi.js keeps its output cache outside of any reactive object.

import { getSharedAudioContext, resumeSharedAudioContext } from './audioContext.js';
import { getReverbInput } from './reverb.js';
import { decodeAiffToAudioBuffer, isAiffBuffer, isAiffFile } from './aiffDecode.js';

export async function resumeSamplerAudio() {
  return resumeSharedAudioContext();
}

const bufferCache = new Map(); // padId -> AudioBuffer
let voiceId = 0;
const activeVoices = new Map(); // voiceId -> { id, padId, source, gain }

const CUT_RAMP_SEC = 0.008;

async function decodeArrayBuffer(arrayBuffer, audioContext, { label = 'sample' } = {}) {
  if (isAiffBuffer(arrayBuffer)) {
    try {
      return decodeAiffToAudioBuffer(arrayBuffer, audioContext);
    } catch (aiffErr) {
      console.warn(`AIFF parser failed for "${label}", trying native decoder:`, aiffErr);
    }
  }

  try {
    return await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } catch (nativeErr) {
    if (isAiffBuffer(arrayBuffer)) {
      throw new Error(
        `Could not decode "${label}". Try exporting as WAV, or use an uncompressed AIFF/AIFC (PCM/sowt).`
      );
    }
    throw new Error(`Could not decode "${label}": ${nativeErr.message ?? nativeErr}`);
  }
}

async function decodeSampleFile(file, arrayBuffer, audioContext) {
  if (isAiffFile(file) || isAiffBuffer(arrayBuffer)) {
    try {
      return decodeAiffToAudioBuffer(arrayBuffer, audioContext);
    } catch (aiffErr) {
      console.warn(`AIFF parser failed for "${file.name}", trying native decoder:`, aiffErr);
    }
  }

  return decodeArrayBuffer(arrayBuffer, audioContext, { label: file.name });
}

function stopVoice(voice, whenSec) {
  if (!voice) return;
  activeVoices.delete(voice.id);
  try {
    const c = getSharedAudioContext();
    const now = whenSec ?? c.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    const current = voice.gain.gain.value;
    voice.gain.gain.setValueAtTime(current, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + CUT_RAMP_SEC);
    voice.source.stop(now + CUT_RAMP_SEC + 0.002);
  } catch {
    // Source may already have ended.
  }
}

function stopPadVoices(padId, whenSec) {
  for (const voice of [...activeVoices.values()]) {
    if (voice.padId === padId) stopVoice(voice, whenSec);
  }
}

// When triggerPadId fires, choke any playing voices whose pad settings say
// they should be cut by that trigger (including self-retrigger).
function applyCut(triggerPadId, trackPads, whenSec) {
  if (!trackPads?.length) return;
  for (const voice of [...activeVoices.values()]) {
    const victimPad = trackPads.find((p) => p.id === voice.padId);
    if (!victimPad) continue;
    const cutBySelf = victimPad.cutBySelf !== false;
    const cutByPads = victimPad.cutByPads ?? [];
    const shouldCut =
      (triggerPadId === voice.padId && cutBySelf) || cutByPads.includes(triggerPadId);
    if (shouldCut) stopVoice(voice, whenSec);
  }
}

function playbackSettings(opts = {}) {
  const pitch = Math.max(-24, Math.min(24, Number(opts.pitch) || 0));
  const sampleLength = Math.max(0.01, Math.min(1, Number(opts.sampleLength) || 1));
  const fadeOut = Math.max(0, Math.min(1, Number(opts.fadeOut) || 0));
  const rate = Math.pow(2, pitch / 12);
  return { pitch, sampleLength, fadeOut, rate };
}

// Decodes the given File/Blob and caches it under padId, replacing whatever
// sample (if any) was previously assigned to that pad. Returns the decoded
// buffer's duration in seconds, handy for UI feedback.
export async function loadSampleFile(padId, file) {
  stopPadVoices(padId);
  const c = await resumeSamplerAudio();
  const raw = await file.arrayBuffer();
  const arrayBuffer = raw.slice(0);
  const buffer = await decodeSampleFile(file, arrayBuffer, c);
  bufferCache.set(padId, buffer);
  return buffer.duration;
}

// Loads a built-in or remote sample from a URL (e.g. /drums/kick.wav).
export async function loadSampleUrl(padId, url, displayName = '') {
  stopPadVoices(padId);
  const c = await resumeSamplerAudio();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch "${url}": ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = await decodeArrayBuffer(arrayBuffer, c, { label: displayName || url });
  bufferCache.set(padId, buffer);
  return buffer.duration;
}

export function clearSample(padId) {
  stopPadVoices(padId);
  bufferCache.delete(padId);
}

export function hasSample(padId) {
  return bufferCache.has(padId);
}

export function getSampleDuration(padId) {
  return bufferCache.get(padId)?.duration ?? 0;
}

/** Downsampled peaks for waveform UI (0–1 per bucket). */
export function getSampleWaveformPeaks(padId, peakCount = 240) {
  const buffer = bufferCache.get(padId);
  if (!buffer) return null;
  const channel = buffer.getChannelData(0);
  if (!channel.length) return { peaks: [], duration: buffer.duration };
  const blockSize = Math.max(1, Math.floor(channel.length / peakCount));
  const peaks = [];
  for (let i = 0; i < peakCount; i++) {
    let max = 0;
    const start = i * blockSize;
    const end = Math.min(channel.length, start + blockSize);
    for (let j = start; j < end; j++) max = Math.max(max, Math.abs(channel[j]));
    peaks.push(max);
  }
  return { peaks, duration: buffer.duration };
}

// `delayMs` is relative to the shared transport AudioContext's currentTime —
// same convention as _delayMs() in scheduler.js. Using the shared context
// (see audioContext.js) keeps drum hits aligned with MIDI note scheduling.
// `gainMul` scales the hit after velocity (pad volume × track volume).
// `opts` may include pitch, sampleLength, fadeOut, cutBySelf, cutByPads, trackPads.
export function playSample(padId, velocity = 100, delayMs = 0, gainMul = 1, opts = {}) {
  const buffer = bufferCache.get(padId);
  if (!buffer) return;

  const c = getSharedAudioContext();
  const when = c.currentTime + Math.max(0, delayMs) / 1000;
  const trackPads = opts.trackPads ?? [];
  if (trackPads.length) applyCut(padId, trackPads, when);

  const { sampleLength, fadeOut, rate } = playbackSettings(opts);
  const playDurationSec = (buffer.duration * sampleLength) / rate;
  const fadeDurationSec = playDurationSec * fadeOut;
  const fadeStartSec = when + playDurationSec - fadeDurationSec;
  const endTime = when + playDurationSec;

  const src = c.createBufferSource();
  src.buffer = buffer;
  // Schedule rate at the voice start time — assigning .value alone misses future
  // scheduled hits and can leave playbackRate at 1 in some browsers.
  src.playbackRate.cancelScheduledValues(0);
  src.detune.cancelScheduledValues(0);
  src.playbackRate.setValueAtTime(rate, when);
  src.detune.setValueAtTime(0, when);

  const gain = c.createGain();
  const velGain = Math.max(0, Math.min(1, velocity / 127));
  const peakGain = Math.max(0, Math.min(1, velGain * gainMul));
  const reverbSend = Math.max(0, Math.min(1, opts.reverb ?? 0));

  src.connect(gain);

  if (reverbSend > 0.001) {
    const dryGain = c.createGain();
    const wetGain = c.createGain();
    dryGain.gain.value = 1 - reverbSend;
    wetGain.gain.value = reverbSend;
    gain.connect(dryGain);
    gain.connect(wetGain);
    dryGain.connect(c.destination);
    wetGain.connect(getReverbInput(padId, opts.reverbDecay));
  } else {
    gain.connect(c.destination);
  }

  gain.gain.setValueAtTime(peakGain, when);
  if (fadeOut > 0 && fadeDurationSec > 0.001) {
    gain.gain.setValueAtTime(peakGain, Math.max(when, fadeStartSec));
    gain.gain.linearRampToValueAtTime(0, when + playDurationSec);
  }

  const voice = { id: ++voiceId, padId, source: src, gain };
  activeVoices.set(voice.id, voice);
  src.onended = () => activeVoices.delete(voice.id);

  src.start(when, 0);
  src.stop(endTime);
}
