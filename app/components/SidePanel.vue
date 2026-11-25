<script setup lang="ts">
/**
 * Боковая панель справа: затемнение, выезд, заголовок с крестиком.
 * Закрывается по клику на фон и Esc (обработчик на странице).
 */
defineProps<{ title: string; label?: string; width?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="side-backdrop" @click.self="emit('close')">
    <aside
      class="side-panel"
      role="dialog"
      aria-modal="true"
      :aria-label="label ?? title"
      :style="width ? { width } : undefined"
    >
      <div class="modal-head">
        <h2>{{ title }}</h2>
        <button class="icon-btn" aria-label="Закрыть" @click="emit('close')">
          <Icon name="lucide:x" />
        </button>
      </div>
      <slot />
    </aside>
  </div>
</template>
