<template>
  <!-- Persistent chrome shared by piano roll and live — avoids layout jump on view switch. -->
  <div class="daw-toolbar" data-piano-roll-chrome>
    <div class="daw-toolbar-primary">
      <TransportToolbar
        :playing="playing"
        :bpm="bpm"
        :sync-mode="syncMode"
        :clock-input-id="clockInputId"
        @toggle-play="emit('toggle-play')"
        @bpm-change="(v) => emit('bpm-change', v)"
      />
      <!-- Piano-roll-only controls teleport in here; empty in live mode. -->
      <div
        id="daw-roll-toolbar-extras"
        class="flex flex-wrap items-start gap-x-1 gap-y-0.5 min-w-0"
      ></div>
    </div>

    <div class="daw-toolbar-divider"></div>

    <div class="daw-toolbar-secondary">
      <ViewToggleButton
        :mode="viewMode"
        @view-mode-change="(v) => emit('view-mode-change', v)"
      />

      <div class="daw-toolbar-divider"></div>

      <SongMenu
        :songs="songs"
        :active-song-id="activeSongId"
        :bpm="bpm"
        :compact-navbar="compactNavbar"
        @select="(id) => emit('select-song', id)"
        @update="(id, changes) => emit('update-song', id, changes)"
        @create="(name) => emit('create-song', name)"
        @delete="(id) => emit('delete-song', id)"
        @save-file="emit('save-song-file')"
        @load-file="(text) => emit('load-song-file', text)"
        @load-file-error="(msg) => emit('load-song-file-error', msg)"
      />

      <div class="daw-toolbar-divider"></div>

      <SupportToolbarButton />

      <HelpToolbarButton />

      <SettingsToolbarButton
        :sync-mode="syncMode"
        :clock-input-id="clockInputId"
        :send-midi-clock="sendMidiClock"
        :clock-output-id="clockOutputId"
        :compact-navbar="compactNavbar"
        :midi-inputs="midiInputs"
        :midi-outputs="midiOutputs"
        @sync-mode-change="(v) => emit('sync-mode-change', v)"
        @clock-input-change="(v) => emit('clock-input-change', v)"
        @toggle-clock="emit('toggle-clock')"
        @clock-output-change="(v) => emit('clock-output-change', v)"
        @compact-navbar-change="(v) => emit('compact-navbar-change', v)"
      />
    </div>
  </div>
</template>

<script setup>
import TransportToolbar from './TransportToolbar.vue';
import ViewToggleButton from './ViewToggleButton.vue';
import SongMenu from './SongMenu.vue';
import SupportToolbarButton from './SupportToolbarButton.vue';
import HelpToolbarButton from './HelpToolbarButton.vue';
import SettingsToolbarButton from './SettingsToolbarButton.vue';

defineProps({
  viewMode: { type: String, required: true },
  playing: Boolean,
  bpm: Number,
  syncMode: { type: String, default: 'internal' },
  clockInputId: { type: String, default: '' },
  sendMidiClock: Boolean,
  clockOutputId: { type: String, default: '' },
  compactNavbar: Boolean,
  midiInputs: { type: Array, default: () => [] },
  midiOutputs: { type: Array, default: () => [] },
  songs: { type: Array, default: () => [] },
  activeSongId: String,
});

const emit = defineEmits([
  'toggle-play',
  'bpm-change',
  'view-mode-change',
  'select-song',
  'update-song',
  'create-song',
  'delete-song',
  'save-song-file',
  'load-song-file',
  'load-song-file-error',
  'sync-mode-change',
  'clock-input-change',
  'toggle-clock',
  'clock-output-change',
  'compact-navbar-change',
]);
</script>
