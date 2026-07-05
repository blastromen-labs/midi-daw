<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      @mousedown.self="emit('close')"
    >
      <div
        class="w-full max-w-sm bg-panel border border-line rounded-lg shadow-xl overflow-hidden"
        role="dialog"
        aria-labelledby="settings-title"
        @mousedown.stop
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 id="settings-title" class="text-sm font-semibold">Settings</h2>
          <button
            type="button"
            class="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-white hover:bg-surface-hover"
            title="Close"
            @click="emit('close')"
          >
            ×
          </button>
        </div>

        <div class="px-4 py-3 space-y-4">
          <section>
            <h3 class="text-[10px] uppercase tracking-wider text-muted-dim mb-2">Sync</h3>
            <p class="text-[11px] text-muted mb-2 leading-snug">
              Internal — this app is the master clock. External — follow incoming MIDI clock (e.g. FL Studio).
            </p>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="flex-1 px-2 py-1.5 rounded text-xs"
                :class="syncMode === 'internal' ? 'bg-accent text-white' : 'bg-surface-hover hover:bg-surface-active'"
                @click="emit('sync-mode-change', 'internal')"
              >
                Internal
              </button>
              <button
                type="button"
                class="flex-1 px-2 py-1.5 rounded text-xs"
                :class="syncMode === 'external' ? 'bg-accent text-white' : 'bg-surface-hover hover:bg-surface-active'"
                @click="emit('sync-mode-change', 'external')"
              >
                External
              </button>
            </div>
          </section>

          <section v-if="syncMode === 'external'">
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">
              MIDI clock input
            </label>
            <select
              :value="clockInputId"
              class="w-full text-xs py-1.5 px-2 bg-surface border border-line-light rounded"
              @change="(e) => emit('clock-input-change', e.target.value)"
            >
              <option value="">— Select input —</option>
              <option v-for="d in midiInputs" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
          </section>

          <section class="border-t border-line pt-4">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-dim mb-2">MIDI clock out</h3>
            <div class="flex items-center justify-between gap-3 mb-3">
              <span class="text-xs text-muted">Send clock to outputs</span>
              <button
                type="button"
                class="w-10 h-5 rounded-full transition-colors relative flex-shrink-0"
                :class="sendMidiClock ? 'bg-accent' : 'bg-surface-hover'"
                title="Send MIDI clock to connected outputs"
                @click="emit('toggle-clock')"
              >
                <span
                  class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                  :class="sendMidiClock ? 'left-5' : 'left-0.5'"
                ></span>
              </button>
            </div>
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">
              Output device
            </label>
            <select
              :value="clockOutputId"
              class="w-full text-xs py-1.5 px-2 bg-surface border border-line-light rounded disabled:opacity-40"
              :disabled="!sendMidiClock"
              @change="(e) => emit('clock-output-change', e.target.value)"
            >
              <option value="">All outputs</option>
              <option v-for="d in midiOutputs" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  syncMode: { type: String, default: 'internal' },
  clockInputId: { type: String, default: '' },
  sendMidiClock: Boolean,
  clockOutputId: { type: String, default: '' },
  midiInputs: { type: Array, default: () => [] },
  midiOutputs: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'close',
  'sync-mode-change',
  'clock-input-change',
  'toggle-clock',
  'clock-output-change',
]);
</script>
