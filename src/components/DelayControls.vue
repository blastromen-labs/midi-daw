<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <label class="text-[9px] uppercase tracking-wider text-muted-dim">
        Delay — {{ Math.round((model.delay ?? 0) * 100) }}%
      </label>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="px-1.5 py-0.5 rounded text-[9px] ring-1 transition-colors"
          :class="
            (model.delay ?? 0) > 0
              ? 'bg-accent/25 ring-accent text-white'
              : 'bg-surface-hover ring-line-light text-muted hover:text-white'
          "
          @click="emit('update', { delay: (model.delay ?? 0) > 0 ? 0 : 0.35 })"
        >
          {{ (model.delay ?? 0) > 0 ? 'On' : 'Off' }}
        </button>
        <button
          type="button"
          class="px-1.5 py-0.5 rounded text-[9px] ring-1 transition-colors"
          :class="
            model.delaySync
              ? 'bg-accent/25 ring-accent text-white'
              : 'bg-surface-hover ring-line-light text-muted hover:text-white'
          "
          title="Tempo-sync delay taps to the project BPM"
          @click="emit('update', { delaySync: !model.delaySync })"
        >
          Sync
        </button>
      </div>
    </div>

    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      :value="model.delay ?? 0"
      class="w-full accent-accent"
      @input="emit('update', { delay: Number($event.target.value) })"
    />

    <template v-if="(model.delay ?? 0) > 0.001 || alwaysExpanded">
      <div class="grid grid-cols-2 gap-2">
        <label class="block min-w-0">
          <span class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">Left</span>
          <select
            v-if="model.delaySync"
            class="w-full text-[11px] py-1 px-1 bg-surface border border-line-light rounded"
            :value="model.delayLeftSync ?? DELAY_LEFT_SYNC_DEFAULT"
            @change="emit('update', { delayLeftSync: $event.target.value })"
          >
            <option v-for="opt in DELAY_SYNC_OPTIONS" :key="`l-${opt.value}`" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <template v-else>
            <input
              type="range"
              :min="DELAY_MS_MIN"
              :max="DELAY_MS_MAX"
              step="1"
              :value="model.delayLeftMs ?? DELAY_LEFT_MS_DEFAULT"
              class="w-full accent-accent"
              @input="emit('update', { delayLeftMs: Number($event.target.value) })"
            />
            <span class="text-[9px] text-muted-dim">{{ model.delayLeftMs ?? DELAY_LEFT_MS_DEFAULT }} ms</span>
          </template>
        </label>

        <label class="block min-w-0">
          <span class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">Right</span>
          <select
            v-if="model.delaySync"
            class="w-full text-[11px] py-1 px-1 bg-surface border border-line-light rounded"
            :value="model.delayRightSync ?? DELAY_RIGHT_SYNC_DEFAULT"
            @change="emit('update', { delayRightSync: $event.target.value })"
          >
            <option v-for="opt in DELAY_SYNC_OPTIONS" :key="`r-${opt.value}`" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <template v-else>
            <input
              type="range"
              :min="DELAY_MS_MIN"
              :max="DELAY_MS_MAX"
              step="1"
              :value="model.delayRightMs ?? DELAY_RIGHT_MS_DEFAULT"
              class="w-full accent-accent"
              @input="emit('update', { delayRightMs: Number($event.target.value) })"
            />
            <span class="text-[9px] text-muted-dim">{{ model.delayRightMs ?? DELAY_RIGHT_MS_DEFAULT }} ms</span>
          </template>
        </label>
      </div>

      <div>
        <label class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">
          Feedback — {{ Math.round((model.delayFeedback ?? DELAY_FEEDBACK_DEFAULT) * 100) }}%
        </label>
        <input
          type="range"
          min="0"
          :max="DELAY_FEEDBACK_MAX"
          step="0.01"
          :value="model.delayFeedback ?? DELAY_FEEDBACK_DEFAULT"
          class="w-full accent-accent"
          @input="emit('update', { delayFeedback: Number($event.target.value) })"
        />
      </div>

      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          class="rounded"
          :checked="!!model.delayCutLow"
          @change="emit('update', { delayCutLow: $event.target.checked })"
        />
        <span class="text-[10px] text-muted leading-snug">
          Cut low — high-pass delay at {{ DELAY_LOW_CUT_HZ }} Hz
        </span>
      </label>
    </template>
  </div>
</template>

<script setup>
import {
  DELAY_MS_MIN,
  DELAY_MS_MAX,
  DELAY_LEFT_MS_DEFAULT,
  DELAY_RIGHT_MS_DEFAULT,
  DELAY_FEEDBACK_DEFAULT,
  DELAY_FEEDBACK_MAX,
  DELAY_LEFT_SYNC_DEFAULT,
  DELAY_RIGHT_SYNC_DEFAULT,
  DELAY_LOW_CUT_HZ,
  DELAY_SYNC_OPTIONS,
} from '../models/project.js';

defineProps({
  /** Pad, zone, or draft object with delay* fields. */
  model: { type: Object, required: true },
  /** When true, always show tap/feedback controls (editor modals). */
  alwaysExpanded: { type: Boolean, default: false },
});

const emit = defineEmits(['update']);
</script>
