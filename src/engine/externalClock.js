import { PPQN, beginMidiScheduleTick, endMidiScheduleTick } from './midi.js';
import { beatsToSeconds, secondsToBeats, wrapLoopBeat } from './beatMath.js';

const TICK_HISTORY = PPQN; // one beat's worth — smooths jitter without lagging tempo changes
const MAX_VALID_INTERVAL_MS = 2000;

// Follows an external MIDI clock (e.g. FL Studio set as the sync master)
// instead of generating its own. Implements the same read-only clock
// interface as TransportClock (bpm, playing, beat math, onTick) so the
// scheduler and UI can consume whichever clock is active without caring
// which one it is — see engine/activeClock.js.
export class ExternalClock {
  constructor() {
    this.playing = false;
    this.bpm = 120;
    this.loopStartBeat = 0;
    this.loopEndBeat = 4;

    this._tickCount = 0;
    this._lastTickAt = null;
    this._intervals = [];
    this._listeners = new Set();
  }

  get loopLengthBeats() {
    return this.loopEndBeat - this.loopStartBeat;
  }

  // performance.now()-based, matching the time base Web MIDI timestamps use —
  // see toAbsoluteTimestamp() in midi.js.
  get currentTime() {
    return performance.now() / 1000;
  }

  beatToSec(beat) {
    return beatsToSeconds(beat, this.bpm);
  }

  secToBeat(sec) {
    return secondsToBeats(sec, this.bpm);
  }

  getAbsoluteBeat() {
    return this._tickCount / PPQN;
  }

  getCurrentBeat() {
    return this._wrapBeat(this.getAbsoluteBeat());
  }

  // Unlike the internal master clock, we can't know future tick timing in
  // advance here — this estimates near-term event times (e.g. a note-off a
  // fraction of a beat away) from the current smoothed tempo, anchored to "now".
  beatToAudioTime(beat) {
    const deltaBeats = beat - this.getAbsoluteBeat();
    return this.currentTime + this.beatToSec(deltaBeats);
  }

  _wrapBeat(beat) {
    return wrapLoopBeat(beat, this.loopStartBeat, this.loopEndBeat);
  }

  onTick(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(type, data) {
    for (const fn of this._listeners) fn(type, data);
  }

  // Feed raw incoming MIDI bytes here, e.g. from midi.js's listenToInput().
  handleMessage(data) {
    const status = data[0];
    if (status === 0xf8) this._onClockTick();
    else if (status === 0xfa) this._onStart();
    else if (status === 0xfb) this._onContinue();
    else if (status === 0xfc) this._onStop();
  }

  _onStart() {
    this._tickCount = 0;
    this._intervals = [];
    this._lastTickAt = null;
    this.playing = true;
    beginMidiScheduleTick();
    try {
      this._emit('start', { beat: 0, time: this.currentTime });
    } finally {
      endMidiScheduleTick();
    }
  }

  _onContinue() {
    this.playing = true;
    beginMidiScheduleTick();
    try {
      this._emit('start', { beat: this.getCurrentBeat(), time: this.currentTime });
    } finally {
      endMidiScheduleTick();
    }
  }

  _onStop() {
    this.playing = false;
    this._emit('stop', { beat: this.getCurrentBeat() });
  }

  _onClockTick() {
    if (!this.playing) return;

    const now = performance.now();
    if (this._lastTickAt !== null) {
      const interval = now - this._lastTickAt;
      if (interval > 0 && interval < MAX_VALID_INTERVAL_MS) {
        this._intervals.push(interval);
        if (this._intervals.length > TICK_HISTORY) this._intervals.shift();
        const avgIntervalMs = this._intervals.reduce((a, b) => a + b, 0) / this._intervals.length;
        this.bpm = 60000 / (avgIntervalMs * PPQN);
      }
    }
    this._lastTickAt = now;

    const time = this.currentTime;
    const beat = this._wrapBeat(this.getAbsoluteBeat());

    beginMidiScheduleTick(now);
    try {
      this._emit('clock', { time, tick: this._tickCount, beat });

      // Zero-width window: we only ever know "now", so this fires notes whose
      // scheduled beat lines up with the current tick (~1/24 beat resolution).
      this._emit('scheduleNotes', { now: time, scheduleUntil: time });
    } finally {
      endMidiScheduleTick();
    }

    this._tickCount++;
  }
}

export const externalClock = new ExternalClock();
