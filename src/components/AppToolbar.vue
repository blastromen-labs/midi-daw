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
      <!-- Live-only: reveal hidden clips and/or quick-edit pens on tracks/patterns/scenes. -->
      <template v-if="viewMode === 'live'">
        <ToolbarField
          label="Hidden"
          :title="showHidden
            ? 'Showing tracks/patterns marked Hide from Live — click to hide them again'
            : 'Show tracks and patterns marked Hide from Live (still play via scenes)'"
        >
          <button
            type="button"
            class="h-6 px-1.5 rounded text-[9px] font-semibold uppercase tracking-wider transition-colors"
            :class="showHidden
              ? 'bg-surface-active text-white'
              : 'bg-surface-hover text-muted hover:text-white hover:bg-surface-active'"
            :aria-pressed="showHidden"
            @click="emit('toggle-show-hidden')"
          >
            Show
          </button>
        </ToolbarField>

        <ToolbarField
          label="Edit"
          :title="editMode
            ? 'Edit pens visible on tracks, patterns, and scenes — click to hide'
            : 'Show edit pens on tracks, patterns, and scenes for quick settings'"
        >
          <button
            type="button"
            class="h-6 px-1.5 rounded text-[9px] font-semibold uppercase tracking-wider transition-colors"
            :class="editMode
              ? 'bg-surface-active text-white'
              : 'bg-surface-hover text-muted hover:text-white hover:bg-surface-active'"
            :aria-pressed="editMode"
            @click="emit('toggle-edit-mode')"
          >
            Pens
          </button>
        </ToolbarField>

        <div class="daw-toolbar-divider"></div>
      </template>

      <!-- Song picker is roll-only — Live shows every song as its own block. -->
      <template v-else>
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
      </template>

      <!-- Keep View fixed left of Support so it doesn't jump when Song/Hidden swap. -->
      <ViewToggleButton
        :mode="viewMode"
        @view-mode-change="(v) => emit('view-mode-change', v)"
      />

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
import ToolbarField from './ToolbarField.vue';

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
  showHidden: Boolean,
  editMode: Boolean,
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
  'toggle-show-hidden',
  'toggle-edit-mode',
]);
</script>
