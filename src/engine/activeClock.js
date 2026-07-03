import { transport } from './clock.js';

// Single source of truth for "whichever clock is currently driving playback".
// Swapped between the internal master clock (TransportClock) and the external
// MIDI-clock follower (ExternalClock) when Sync Mode changes, so every
// consumer — the scheduler, the piano roll, the transport bar, etc. — reads
// through here instead of importing a specific clock directly.
let activeClock = transport;

export function getActiveClock() {
  return activeClock;
}

export function setActiveClock(clock) {
  activeClock = clock;
}
