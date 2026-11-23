<script setup lang="ts">
import type { ExternalLink } from '#shared/types'

/**
 * Редактор блока «Ссылки»: строки «название + URL», добавление/удаление.
 * v-model — массив ExternalLink; пустые строки отфильтровывает родитель
 * при сохранении (или validate()).
 */
const props = defineProps<{
  modelValue: ExternalLink[]
}>()
const emit = defineEmits<{ 'update:modelValue': [links: ExternalLink[]] }>()

function add() {
  emit('update:modelValue', [...props.modelValue, { title: '', url: '' }])
}
function remove(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}
function set(i: number, patch: Partial<ExternalLink>) {
  emit('update:modelValue', props.modelValue.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
}

/** Валидные ссылки для сохранения: оба поля заполнены, url — http(s). */
function validLinks(): ExternalLink[] {
  return props.modelValue
    .map(l => ({ title: l.title.trim(), url: l.url.trim() }))
    .filter(l => l.title && /^https?:\/\//i.test(l.url))
}
defineExpose({ validLinks })
</script>

<template>
  <div class="links-field">
    <div v-for="(l, i) in modelValue" :key="i" class="links-field-row">
      <input
        :value="l.title"
        placeholder="Название (например, видеоурок)"
        maxlength="120"
        @input="set(i, { title: ($event.target as HTMLInputElement).value })"
      >
      <input
        :value="l.url"
        placeholder="https://…"
        maxlength="2000"
        @input="set(i, { url: ($event.target as HTMLInputElement).value })"
      >
      <button
        class="icon-btn danger"
        :aria-label="`Удалить ссылку ${i + 1}`"
        @click="remove(i)"
      >
        <Icon name="lucide:trash-2" />
      </button>
    </div>
    <button class="small" @click="add">+ Добавить ссылку</button>
  </div>
</template>

<style scoped>
.links-field { display: flex; flex-direction: column; gap: 8px; }
.links-field-row { display: flex; gap: 8px; align-items: center; }
.links-field-row input { flex: 1; min-width: 0; }
.links-field-row input:first-child { flex: 0 0 220px; }
</style>
