# MIDI DAW

A browser-based mini DAW, built with Vue 3 + Vite. It's modeled on FL Studio's
piano roll workflow, with:

- An **FL Studio-style piano roll** for MIDI composition, with multiple
  switchable MIDI channels, velocity editing, snapping, zoom (horizontal and
  vertical), and multi-select/drag/resize/clone note editing.
- **Sample-based drum channels** — a special piano-roll channel type where
  each row is a named pad (Kick, Snare, Hi-Hat, etc.) that you assign a local
  audio sample to; drawing notes on that row triggers the sample, no MIDI
  hardware or synth engine required.
- **Per-channel MIDI output/channel routing** to external synths via the
  [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API).
- A **jitter-free master clock**, built on the Web Audio API's lookahead
  scheduling pattern, so MIDI note timing stays tight even under UI load.
- **External MIDI clock sync** — instead of generating its own clock, the app
  can follow an incoming MIDI clock from another app (e.g. FL Studio set as
  the sync master), detecting tempo and start/stop from the incoming stream.

Everything runs entirely in the browser — there's no backend, and no project
persistence yet (loaded samples and note data live only in memory for the
current tab session).

## Requirements

- [Node.js](https://nodejs.org/) 18 or later
- A browser with [Web MIDI API](https://caniuse.com/midi) support if you want
  to route channels to external MIDI hardware/software — **Chrome or Edge**.
  The piano roll, drum sampler, and internal clock all work in any modern
  browser; only external MIDI I/O requires Web MIDI support.

## Getting started

Install dependencies:

```bash
npm install
```

Start the dev server (hot-reloads on save):

```bash
npm run dev
```

Vite will print a local URL (typically `http://localhost:5173`) — open it in
Chrome or Edge to get full MIDI routing support.

## Building for production

```bash
npm run build
```

This produces a static, fully client-side bundle in `dist/`. You can preview
the production build locally before deploying:

```bash
npm run preview
```

## Deploying to Cloudflare

Since this is a fully static Vite build (no server-side code), it deploys
cleanly to [Cloudflare Pages](https://pages.cloudflare.com/).

### Option A: Cloudflare dashboard (Git integration)

1. Push this repo to GitHub/GitLab.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages →
   Connect to Git** and select the repo.
3. Use these build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Deploy — Cloudflare will rebuild and redeploy automatically on every push.

### Option B: Wrangler CLI (deploy from your machine)

```bash
npm run build
npx wrangler pages deploy dist
```

The first run will prompt you to log in and create/select a Pages project.
Subsequent runs redeploy to the same project.

> Note: since this app talks to hardware via the Web MIDI API and requests
> `AudioContext`s, it must be served over **HTTPS** (Cloudflare Pages does
> this by default) — browsers block Web MIDI on plain HTTP outside of
> `localhost`.

## Project structure

```
src/
  engine/            Framework-agnostic playback/MIDI logic (no Vue imports)
    clock.js          TransportClock — the internal master clock. Web Audio-based,
                       lookahead scheduler, emits 'start'/'stop'/'clock'/'scheduleNotes'.
    externalClock.js  ExternalClock — follows an incoming MIDI clock (e.g. FL
                       Studio as sync master). Implements the same interface as
                       TransportClock so consumers don't need to know which is active.
    activeClock.js    Single source of truth for "whichever clock is driving
                       playback right now" — every consumer reads through getActiveClock().
    scheduler.js      PlaybackEngine — turns clock ticks into MIDI Note On/Off,
                       clock bytes, and drum sample triggers.
    midi.js           Web MIDI API wrapper: device enumeration, sending messages
                       (absolute performance.now()-based timestamps), listening to inputs.
    sampler.js         Drum sample engine: loads local audio files per pad and
                       plays them back as one-shots via the Web Audio API.
  models/
    project.js         Plain-data project/track/note/pad model + factory functions.
  composables/
    usePlayheadBeat.js  Vue composables that sample the active clock via
                       requestAnimationFrame, decoupled from the audio scheduler's timer.
  components/          Vue UI: TransportBar, PianoRoll, DrumPadList, VelocityLane,
                       MidiRouteSelect. Read props/emit events; delegate all
                       playback/MIDI/sample decisions to engine/.
  App.vue              Wires project state (reactive) to the engine singletons
                       and owns sync-mode switching.
```

## Key implementation notes

- **MIDI timestamps are absolute, not relative.** `midi.js` converts every
  relative delay to `performance.now() + delay` in one place. Never call
  `output.send()` directly from elsewhere.
- **UI redraws never run on the scheduler's timer.** Canvas/DOM updates driven
  by playback position go through `usePlayheadBeat` (`requestAnimationFrame`-based),
  never a listener on the clock's tick events, so a slow render can't delay a
  MIDI event.
- **`getActiveClock()` is the only way consumers should read clock state** —
  don't import the internal/external clock directly outside of
  `activeClock.js` and `App.vue`'s sync-mode wiring.
- **Drum tracks are sample-based, not MIDI.** A drum track's notes reference a
  pad id (not a MIDI pitch); sample playback is a one-shot triggered through
  `engine/sampler.js`, entirely independent of the Web MIDI API.
