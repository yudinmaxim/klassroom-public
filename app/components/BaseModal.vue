<script setup lang="ts">
/**
 * Базовая модалка: затемнение + карточка по центру.
 * #default — содержимое, #foot — кнопки действий (в .modal-foot).
 * Закрытие: клик по фону, кнопка-крестик, emit('close').
 */
defineProps<{ title: string, width?: string, height?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      :style="width || height ? { width, height } : undefined"
    >
      <slot name="head">
        <div class="modal-head">
          <h2>{{ title }}</h2>
          <button class="icon-btn" aria-label="Закрыть" @click="emit('close')">
            <Icon name="lucide:x" />
          </button>
        </div>
      </slot>
      <slot />
      <div v-if="$slots.foot" class="modal-foot">
        <slot name="foot" />
      </div>
    </div>
  </div>
</template>
