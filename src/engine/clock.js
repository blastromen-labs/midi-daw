import { PPQN } from './midi.js';

const SCHEDULE_AHEAD_SEC = 0.15;
const LOOKAHEAD_MS = 25;

export class TransportClock {
  constructor() {
    this.bpm = 120;
    this.playing = false;
    this.currentBeat = 0;
    this.patternSteps = 16;
    this.stepsPerBeat = 4;
    this.loopStartBeat = 0;
    this.loopEndBeat = 4;

    this._ctx = null;
    this._startAudioTime = 0;
    this._startBeat = 0;
    this._timer = null;
    this._nextClockTick = 0;
    this._scheduled = new Set();
    this._listeners = new Set();
  }

  get loopLengthBeats() {
    return this.loopEndBeat - this.loopStartBeat;
  }

  get patternLengthBeats() {
    return this.patternSteps / this.stepsPerBeat;
  }

  async init() {
    this._ctx = new AudioContext();
    if (this._ctx.state === 'suspended') await this._ctx.resume();
    return this._ctx;
  }

  get audioContext() {
    return this._ctx;
  }

  get currentTime() {
    return this._ctx?.currentTime ?? 0;
  }

  beatToSec(beat) {
    return (beat * 60) / this.bpm;
  }

  secToBeat(sec) {
    return (sec * this.bpm) / 60;
  }

  getAbsoluteBeat() {
    if (!this.playing || !this._ctx) return this.currentBeat;
    const elapsed = this._ctx.currentTime - this._startAudioTime;
    return this._startBeat + this.secToBeat(elapsed);
  }

  getCurrentBeat() {
    return this._wrapBeat(this.getAbsoluteBeat());
  }

  beatToAudioTime(absoluteBeat) {
    if (!this.playing || !this._ctx) return this.currentTime;
    return this._startAudioTime + this.beatToSec(absoluteBeat - this._startBeat);
  }

  _wrapBeat(beat) {
    const len = this.loopLengthBeats;
    if (len <= 0) return beat;
    if (beat >= this.loopEndBeat) {
      return this.loopStartBeat + ((beat - this.loopStartBeat) % len);
    }
    if (beat < this.loopStartBeat) {
      return this.loopStartBeat;
    }
    return beat;
  }

  onTick(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(type, data) {
    for (const fn of this._listeners) fn(type, data);
  }

  async play(fromBeat = null) {
    if (!this._ctx) await this.init();
    if (this._ctx.state === 'suspended') await this._ctx.resume();

    const beat = this._wrapBeat(fromBeat ?? this.currentBeat);
    this._startBeat = beat;
    this._startAudioTime = this._ctx.currentTime + 0.02;
    this.playing = true;
    this._nextClockTick = Math.floor(beat * PPQN);
    this._scheduled.clear();

    this._emit('start', { beat, time: this._startAudioTime });
    this._timer = setInterval(() => this._scheduler(), LOOKAHEAD_MS);
    this._scheduler();
  }

  stop() {
    this.playing = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.currentBeat = this.getCurrentBeat();
    this._scheduled.clear();
    this._emit('stop', { beat: this.currentBeat });
  }

  seek(beat) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.stop();
    this.currentBeat = this._wrapBeat(beat);
    if (wasPlaying) this.play(this.currentBeat);
  }

  _key(type, id) {
    return `${type}:${id}`;
  }

  _scheduler() {
    if (!this.playing || !this._ctx) return;

    const now = this._ctx.currentTime;
    const scheduleUntil = now + SCHEDULE_AHEAD_SEC;

    this._scheduleClockTicks(now, scheduleUntil);
    this._scheduleNotes(now, scheduleUntil);
  }

  _scheduleClockTicks(now, scheduleUntil) {
    const tickSec = 60 / (this.bpm * PPQN);

    while (true) {
      const tickTime = this._startAudioTime + (this._nextClockTick / PPQN - this._startBeat) * (60 / this.bpm);
      // Recalculate more precisely:
      const tickBeat = this._nextClockTick / PPQN;
      const preciseTime = this._startAudioTime + this.beatToSec(tickBeat - this._startBeat);

      if (preciseTime > scheduleUntil) break;

      const key = this._key('clock', this._nextClockTick);
      if (preciseTime >= now - 0.002 && !this._scheduled.has(key)) {
        this._scheduled.add(key);
        const wrapped = this._wrapBeat(tickBeat);
        if (wrapped >= this.loopStartBeat && wrapped < this.loopEndBeat) {
          this._emit('clock', { time: preciseTime, tick: this._nextClockTick, beat: wrapped });
        }
      }
      this._nextClockTick++;
    }
  }

  _scheduleNotes(now, scheduleUntil) {
    this._emit('scheduleNotes', { now, scheduleUntil, startBeat: this._startBeat, startTime: this._startAudioTime });
  }
}

export const transport = new TransportClock();
