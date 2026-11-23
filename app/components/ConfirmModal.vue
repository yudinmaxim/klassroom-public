<script setup lang="ts">
/**
 * Простое модальное подтверждение вместо window.confirm.
 * Эмитит confirm/cancel; закрывается по Esc, крестику и клику по фону.
 */
const props = withDefaults(defineProps<{
  title?: string
  message: string
  confirmLabel?: string
  /** Красная кнопка подтверждения (для удалений). */
  danger?: boolean
}>(), {
  title: 'Подтверждение',
  confirmLabel: 'Подтвердить',
  danger: false,
})
const emit = defineEmits<{ confirm: [], cancel: [] }>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('cancel')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('cancel')">
    <div class="modal confirm-modal" role="alertdialog" aria-modal="true" :aria-label="props.title">
      <div class="modal-head">
        <h2>{{ props.title }}</h2>
        <button class="icon-btn" aria-label="Закрыть" @click="emit('cancel')">
          <Icon name="lucide:x" />
        </button>
      </div>
      <p class="muted" style="margin: 0; white-space: pre-line;">{{ props.message }}</p>
      <div class="modal-foot">
        <button @click="emit('cancel')">Отмена</button>
        <button :class="props.danger ? 'danger-btn' : 'primary'" @click="emit('confirm')">
          {{ props.confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-modal { width: min(420px, calc(100vw - 32px)); }
.danger-btn {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.danger-btn:hover:not(:disabled) { filter: brightness(1.08); }
</style>
