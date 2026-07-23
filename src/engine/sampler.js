// Drum-track sample engine: loads user-provided audio files and plays them
// back as one-shots. Replaces the old built-in synthesized drum sounds
// (drumSynth.js) now that drum tracks are sample-based piano-roll channels.
//
// Decoded AudioBuffers are engine-only state, keyed by pad id, and are never
// stored on the reactive project (see createDrumPad in models/project.js) —
// mirrors how midi.js keeps its output cache outside of any reactive object.

import { getSharedAudioContext, getMasterDestination, resumeSharedAudioContext } from './audioContext.js';
import { getReverbInput } from './reverb.js';
import { getDelayInputFromSource } from './delay.js';
import { getDistortionCurve } from './padDistortion.js';
import { decodeAiffToAudioBuffer, isAiffBuffer, isAiffFile } from './aiffDecode.js';
import { deleteStoredSample, getStoredSample, putStoredSample } from './sampleStorage.js';
import {
  getTrackCutLowHz,
  registerTrackLowCutFilter,
  unregisterTrackLowCutFilter,
  TRACK_LOW_CUT_BYPASS_HZ,
} from './trackLowCut.js';

export async function resumeSamplerAudio() {
  return resumeSharedAudioContext();
}

const bufferCache = new Map(); // padId -> AudioBuffer
let voiceId = 0;
const activeVoices = new Map(); // voiceId -> { id, padId, source, gain, nodes }

const CUT_RAMP_SEC = 0.008;

function releaseVoiceGraph(voice) {
  if (voice.released || !voice.nodes) return;
  voice.released = true;
  if (voice.trackId && voice.lowCut) {
    unregisterTrackLowCutFilter(voice.trackId, voice.lowCut);
  }
  for (const node of voice.nodes) {
    try {
      node.disconnect();
    } catch {
      // Already disconnected or stopped.
    }
  }
}

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
    releaseVoiceGraph(voice);
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

// Drum pads stay within ±24 semis (UI slider). Multi-sampler maps a single
// root across the full MIDI keyboard, so allow ±60 when opts.widePitch is set.
const PITCH_LIMIT_DEFAULT = 24;
const PITCH_LIMIT_WIDE = 60;

function playbackSettings(opts = {}) {
  const pitchLimit = opts.widePitch ? PITCH_LIMIT_WIDE : PITCH_LIMIT_DEFAULT;
  const pitch = Math.max(-pitchLimit, Math.min(pitchLimit, Number(opts.pitch) || 0));
  const sampleLength = Math.max(0.01, Math.min(1, Number(opts.sampleLength) || 1));
  const fadeOut = Math.max(0, Math.min(1, Number(opts.fadeOut) || 0));
  const gain = Math.max(0.25, Math.min(2, Number(opts.gain) || 1));
  const distortion = Math.max(0, Math.min(1, Number(opts.distortion) || 0));
  const rate = Math.pow(2, pitch / 12);
  return { pitch, sampleLength, fadeOut, rate, gain, distortion };
}

// Decodes the given File/Blob and caches it under padId, replacing whatever
// sample (if any) was previously assigned to that pad. Returns the decoded
// buffer's duration in seconds, handy for UI feedback.
//
// Raw bytes are also written to IndexedDB so the custom sample survives
// refresh — decodeAudioData may detach its input, so we keep a separate copy.
export async function loadSampleFile(padId, file) {
  stopPadVoices(padId);
  const c = await resumeSamplerAudio();
  const raw = await file.arrayBuffer();
  const toStore = raw.slice(0);
  const toDecode = raw.slice(0);
  const buffer = await decodeSampleFile(file, toDecode, c);
  bufferCache.set(padId, buffer);
  try {
    await putStoredSample(padId, toStore, { fileName: file.name });
  } catch (err) {
    console.warn(`Failed to persist sample for pad "${padId}":`, err);
  }
  return buffer.duration;
}

// Loads a built-in or remote sample from a URL (e.g. /drums/kick.wav).
// Not persisted — built-ins are re-fetched from /drums/ on hydrate.
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

/**
 * Decode raw bytes into the in-memory cache (used when restoring from IndexedDB).
 * Does not write back to storage.
 */
export async function loadSampleArrayBuffer(padId, arrayBuffer, displayName = '') {
  stopPadVoices(padId);
  const c = await resumeSamplerAudio();
  const label = displayName || 'sample';
  const fileLike = displayName ? { name: displayName } : null;
  const toDecode = arrayBuffer.slice(0);
  const buffer = fileLike
    ? await decodeSampleFile(fileLike, toDecode, c)
    : await decodeArrayBuffer(toDecode, c, { label });
  bufferCache.set(padId, buffer);
  return buffer.duration;
}

/**
 * Restore a previously persisted custom sample into the cache.
 * @returns {Promise<boolean>} true if a stored sample was loaded
 */
export async function restoreStoredSample(padId, fallbackFileName = '') {
  if (!padId || bufferCache.has(padId)) return bufferCache.has(padId);
  const stored = await getStoredSample(padId);
  if (!stored) return false;
  try {
    await loadSampleArrayBuffer(
      padId,
      stored.arrayBuffer,
      stored.fileName || fallbackFileName
    );
    return true;
  } catch (err) {
    console.warn(`Failed to restore stored sample for pad "${padId}":`, err);
    return false;
  }
}

/**
 * Drop the in-memory buffer for a pad. Pass `{ discardStored: true }` when the
 * user clears/removes the pad (or a song is deleted) so IndexedDB is cleaned up
 * too. Song switches leave stored bytes alone so hydrate can restore them.
 */
export function clearSample(padId, { discardStored = false } = {}) {
  stopPadVoices(padId);
  bufferCache.delete(padId);
  if (discardStored) void deleteStoredSample(padId);
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

/** Soft-stop every active voice for a sample id (preview release / clear). */
export function stopSample(padId, whenSec) {
  stopPadVoices(padId, whenSec);
}

/** Soft-stop one voice returned from playSample (per-key preview polyphony). */
export function stopSampleVoice(id, whenSec) {
  const voice = activeVoices.get(id);
  if (voice) stopVoice(voice, whenSec);
}

// `delayMs` is relative to the shared transport AudioContext's currentTime —
// same convention as _delayMs() in scheduler.js. Using the shared context
// (see audioContext.js) keeps drum hits aligned with MIDI note scheduling.
// `gainMul` scales the hit after velocity (pad volume × track volume).
// `opts` may include pitch, widePitch, durationSec, sampleLength, fadeOut,
// cutBySelf, cutByPads, trackPads.
// Returns the voice id (or undefined if no buffer) so callers can gate release.
export function playSample(padId, velocity = 100, delayMs = 0, gainMul = 1, opts = {}) {
  const buffer = bufferCache.get(padId);
  if (!buffer) return undefined;

  const c = getSharedAudioContext();
  const out = getMasterDestination();
  const when = c.currentTime + Math.max(0, delayMs) / 1000;
  const trackPads = opts.trackPads ?? [];
  if (trackPads.length) applyCut(padId, trackPads, when);

  const { sampleLength, fadeOut, rate, gain: padGain, distortion } = playbackSettings(opts);
  // Full buffer region at playback rate, optionally gated by note duration
  // (multi-sampler) so long one-shots don't ring past the piano-roll note.
  const naturalDurationSec = (buffer.duration * sampleLength) / rate;
  const gated =
    opts.durationSec != null && Number.isFinite(opts.durationSec)
      ? Math.max(0.01, Number(opts.durationSec))
      : null;
  const playDurationSec = gated != null ? Math.min(naturalDurationSec, gated) : naturalDurationSec;
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

  const drive = c.createGain();
  drive.gain.setValueAtTime(padGain, when);
  src.connect(drive);

  const nodes = [src, drive];
  let tail = drive;
  if (distortion > 0.001) {
    const shaper = c.createWaveShaper();
    shaper.curve = getDistortionCurve(distortion);
    shaper.oversample = '2x';
    drive.connect(shaper);
    tail = shaper;
    nodes.push(shaper);
  }

  const gain = c.createGain();
  const velGain = Math.max(0, Math.min(1, velocity / 127));
  const peakGain = Math.max(0, Math.min(1, velGain * gainMul));
  const reverbSend = Math.max(0, Math.min(1, opts.reverb ?? 0));
  const delayAmount = Math.max(0, Math.min(1, opts.delay ?? 0));

  tail.connect(gain);
  nodes.push(gain);

  // Track Live HP: always insert an HPF when we know the track so press/drag
  // can open the cut on voices that are already playing (bypass ≈ 20 Hz).
  let bus = gain;
  let lowCut = null;
  const trackId = opts.trackId || null;
  if (trackId) {
    lowCut = c.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.Q.value = 0.707;
    lowCut.frequency.value = getTrackCutLowHz(trackId) ?? TRACK_LOW_CUT_BYPASS_HZ;
    gain.connect(lowCut);
    bus = lowCut;
    nodes.push(lowCut);
    registerTrackLowCutFilter(trackId, lowCut);
  }

  // Dry / reverb balance (crossfade). Delay is a parallel send on top.
  if (reverbSend > 0.001) {
    const dryGain = c.createGain();
    const wetGain = c.createGain();
    dryGain.gain.value = 1 - reverbSend;
    wetGain.gain.value = reverbSend;
    bus.connect(dryGain);
    bus.connect(wetGain);
    dryGain.connect(out);
    wetGain.connect(getReverbInput(padId, opts.reverbDecay));
    nodes.push(dryGain, wetGain);
  } else {
    bus.connect(out);
  }

  if (delayAmount > 0.001) {
    const delaySend = c.createGain();
    delaySend.gain.value = delayAmount;
    bus.connect(delaySend);
    delaySend.connect(getDelayInputFromSource(padId, opts));
    nodes.push(delaySend);
  }

  gain.gain.setValueAtTime(peakGain, when);
  if (fadeOut > 0 && fadeDurationSec > 0.001) {
    gain.gain.setValueAtTime(peakGain, Math.max(when, fadeStartSec));
    gain.gain.linearRampToValueAtTime(0, when + playDurationSec);
  } else if (gated != null) {
    // Short release so gated multi-sampler notes don't click on stop.
    const releaseSec = Math.min(CUT_RAMP_SEC, playDurationSec * 0.5);
    gain.gain.setValueAtTime(peakGain, Math.max(when, endTime - releaseSec));
    gain.gain.linearRampToValueAtTime(0, endTime);
  }

  const voice = { id: ++voiceId, padId, trackId, source: src, gain, lowCut, nodes };
  activeVoices.set(voice.id, voice);
  src.onended = () => {
    activeVoices.delete(voice.id);
    releaseVoiceGraph(voice);
  };

  src.start(when, 0);
  src.stop(endTime);
  return voice.id;
}
