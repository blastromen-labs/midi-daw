<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      @mousedown.self="emit('close')"
    >
      <div
        class="w-full max-w-md max-h-[min(36rem,85vh)] bg-panel border border-line rounded-lg shadow-xl overflow-hidden flex flex-col"
        role="dialog"
        aria-labelledby="shortcuts-help-title"
        @mousedown.stop
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <h2 id="shortcuts-help-title" class="text-sm font-semibold">Keyboard & mouse shortcuts</h2>
          <button
            type="button"
            class="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-white hover:bg-surface-hover"
            title="Close"
            @click="emit('close')"
          >
            ×
          </button>
        </div>

        <div class="px-4 py-3 space-y-4 overflow-y-auto">
          <section v-for="section in sections" :key="section.title">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-dim mb-2">
              {{ section.title }}
            </h3>
            <ul class="space-y-1.5">
              <li
                v-for="item in section.items"
                :key="item.keys + item.description"
                class="flex items-start justify-between gap-3 text-xs"
              >
                <kbd
                  class="shrink-0 px-1.5 py-0.5 rounded bg-surface border border-line-light text-[11px] text-muted font-mono leading-snug"
                >
                  {{ item.keys }}
                </kbd>
                <span class="text-muted text-right leading-snug pt-0.5">{{ item.description }}</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { getShortcutSections } from '../utils/shortcuts.js';

const emit = defineEmits(['close']);

const sections = getShortcutSections();
</script>
