const PPQN = 24;

export { PPQN };

let midiAccess = null;
const outputCache = new Map();
const outputsChangeListeners = new Set();
const inputsChangeListeners = new Set();

export async function initMidi() {
  if (!navigator.requestMIDIAccess) {
    throw new Error('Web MIDI API not supported');
  }
  midiAccess = await navigator.requestMIDIAccess({ sysex: false });
  midiAccess.onstatechange = () => {
    outputCache.clear();
    const outputs = listOutputs();
    for (const listener of outputsChangeListeners) listener(outputs);
    const inputs = listInputs();
    for (const listener of inputsChangeListeners) listener(inputs);
  };
  return midiAccess;
}

export function listOutputs() {
  if (!midiAccess) return [];
  const outputs = [];
  midiAccess.outputs.forEach((output) => {
    outputs.push({ id: output.id, name: output.name || `Output ${outputs.length + 1}` });
  });
  return outputs;
}

// Notified with the fresh output list whenever a MIDI device is plugged in,
// unplugged, or changes state — lets the UI stay live without a page reload.
export function onOutputsChanged(listener) {
  outputsChangeListeners.add(listener);
  return () => outputsChangeListeners.delete(listener);
}

export function listInputs() {
  if (!midiAccess) return [];
  const inputs = [];
  midiAccess.inputs.forEach((input) => {
    inputs.push({ id: input.id, name: input.name || `Input ${inputs.length + 1}` });
  });
  return inputs;
}

export function onInputsChanged(listener) {
  inputsChangeListeners.add(listener);
  return () => inputsChangeListeners.delete(listener);
}

export function getInput(id) {
  if (!id || !midiAccess) return null;
  return midiAccess.inputs.get(id) ?? null;
}

// Subscribes to raw incoming MIDI messages (e.g. clock/start/stop bytes from
// FL Studio's external sync output) on a given input port. Returns an
// unsubscribe function; safe to call even if the input can't be found.
export function listenToInput(inputId, onMessage) {
  const input = getInput(inputId);
  if (!input) return () => {};

  const handler = (event) => onMessage(event.data);
  input.onmidimessage = handler;

  return () => {
    if (input.onmidimessage === handler) input.onmidimessage = null;
  };
}

export function getOutput(id) {
  if (!id || !midiAccess) return null;
  if (outputCache.has(id)) return outputCache.get(id);
  const output = midiAccess.outputs.get(id) ?? null;
  if (output) outputCache.set(id, output);
  return output;
}

// Web MIDI's MIDIOutput.send(data, timestamp) expects an ABSOLUTE timestamp in the
// same time base as performance.now() — not a relative delay. Callers throughout this
// app compute a relative "ms from now" delay, so we convert it here in one place.
//
// When the scheduler is mid-pass (see beginMidiScheduleTick), every send in that
// pass shares one performance.now() snapshot so dense 16th-note bursts don't
// spread across multiple clock reads.
let scheduleAnchorPerfMs = null;

export function beginMidiScheduleTick(anchorPerfMs = performance.now()) {
  scheduleAnchorPerfMs = anchorPerfMs;
}

export function endMidiScheduleTick() {
  scheduleAnchorPerfMs = null;
}

function toAbsoluteTimestamp(delayMs) {
  const now = scheduleAnchorPerfMs ?? performance.now();
  return now + Math.max(0, delayMs);
}

export function sendNoteOn(outputId, channel, note, velocity, delayMs = 0) {
  const output = getOutput(outputId);
  if (!output) return;
  const ch = Math.max(0, Math.min(15, channel));
  output.send([0x90 + ch, note & 0x7f, velocity & 0x7f], toAbsoluteTimestamp(delayMs));
}

export function sendNoteOff(outputId, channel, note, delayMs = 0) {
  const output = getOutput(outputId);
  if (!output) return;
  const ch = Math.max(0, Math.min(15, channel));
  output.send([0x80 + ch, note & 0x7f, 0], toAbsoluteTimestamp(delayMs));
}

export function sendClock(outputId, delayMs = 0) {
  const output = getOutput(outputId);
  if (!output) return;
  output.send([0xf8], toAbsoluteTimestamp(delayMs));
}

export function sendStart(outputId, delayMs = 0) {
  const output = getOutput(outputId);
  if (!output) return;
  output.send([0xfa], toAbsoluteTimestamp(delayMs));
}

export function sendStop(outputId, delayMs = 0) {
  const output = getOutput(outputId);
  if (!output) return;
  output.send([0xfc], toAbsoluteTimestamp(delayMs));
}

export function broadcastClock(outputIds, delayMs = 0) {
  for (const id of outputIds) sendClock(id, delayMs);
}

export function broadcastStart(outputIds, delayMs = 0) {
  for (const id of outputIds) sendStart(id, delayMs);
}

export function broadcastStop(outputIds, delayMs = 0) {
  for (const id of outputIds) sendStop(id, delayMs);
}
