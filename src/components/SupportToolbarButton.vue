<template>
  <div class="support-toolbar-button flex-shrink-0 flex flex-col items-center gap-px">
    <a
      :href="SUPPORT_URL"
      target="_blank"
      rel="noopener noreferrer"
      class="daw-toolbar-icon-btn text-muted hover:text-white bg-surface-hover hover:bg-surface-active"
      title="Support"
      aria-label="Support"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4" aria-hidden="true">
        <path
          d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 0 1-.69.001l-.002-.001Z"
        />
      </svg>
    </a>
    <span class="text-[7px] leading-none invisible select-none" aria-hidden="true">.</span>
  </div>
</template>

<script setup>
const SUPPORT_URL = 'https://buy.stripe.com/fZu5kw4nU0Of3SN81Q6wE00';
</script>
