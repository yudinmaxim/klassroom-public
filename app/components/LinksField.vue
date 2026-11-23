<script setup lang="ts">
import type { ExternalLink } from '#shared/types'
import { normalizeExternalUrl, isHttpUrl } from '#shared/url'
import { LINK_DRAG_MIME } from '~/utils/file-ref'

/**
 * Редактор блока «Ссылки»: строки «название + URL», добавление/удаление.
 * v-model — массив ExternalLink; пустые строки отфильтровывает родитель
 * при сохранении (или validate()).
 * Enter в поле URL при пустом названии — подтягивает <title>/og:title
 * страницы через /api/link-title.
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

/** Подставляем https:// домену без схемы — на blur/Enter и при сохранении. */
function normalize(i: number) {
  const l = props.modelValue[i]
  if (!l) return
  const url = normalizeExternalUrl(l.url)
  if (url !== l.url) set(i, { url })
}

const fetching = ref<number | null>(null)

async function fetchTitle(i: number, force = false) {
  const l = props.modelValue[i]
  if (!l || (!force && l.title.trim()) || fetching.value !== null) return
  const url = normalizeExternalUrl(l.url)
  if (url !== l.url) set(i, { url })
  if (!isHttpUrl(url)) return
  fetching.value = i
  try {
    const r = await $fetch<{ title: string }>('/api/link-title', { query: { url } })
    if (r.title) set(i, { title: r.title.slice(0, 120) })
  } catch { /* страница недоступна — оставляем название как есть */ }
  finally { fetching.value = null }
}

function onUrlKeydown(i: number, e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    void fetchTitle(i)
  }
}

/** Перетаскивание строки в md-редактор → вставка `[title](url)`. */
function onDragStart(i: number, e: DragEvent) {
  const l = props.modelValue[i]
  if (!l?.url) { e.preventDefault(); return }
  const url = normalizeExternalUrl(l.url)
  e.dataTransfer?.setData(LINK_DRAG_MIME, JSON.stringify({ title: l.title, url }))
  e.dataTransfer?.setData('text/plain', url)
  e.dataTransfer?.setData('text/uri-list', url)
}

/** Валидные ссылки для сохранения: оба поля заполнены, url — http(s). */
function validLinks(): ExternalLink[] {
  return props.modelValue
    .map(l => ({ title: l.title.trim(), url: normalizeExternalUrl(l.url) }))
    .filter(l => l.title && isHttpUrl(l.url))
}
defineExpose({ validLinks })
</script>

<template>
  <div class="links-field">
    <div
      v-for="(l, i) in modelValue"
      :key="i"
      class="links-field-row"
      :class="{ 'is-fetching': fetching === i }"
    >
      <span
        class="links-field-grip"
        draggable="true"
        title="Перетащите в текст — вставится markdown-ссылка"
        @dragstart="onDragStart(i, $event)"
      >
        <Icon name="lucide:grip-vertical" />
      </span>
      <div class="links-field-title">
        <input
          :value="l.title"
          placeholder="Название (например, видеоурок)"
          maxlength="120"
          @input="set(i, { title: ($event.target as HTMLInputElement).value })"
        >
        <button
          class="links-field-refresh"
          :class="{ 'is-loading': fetching === i }"
          :disabled="fetching !== null || !isHttpUrl(normalizeExternalUrl(l.url))"
          aria-label="Подтянуть название страницы"
          title="Подтянуть название страницы"
          @click="fetchTitle(i, true)"
        >
          <Icon name="lucide:refresh-cw" />
        </button>
      </div>
      <input
        :value="l.url"
        placeholder="example.com или https://…"
        maxlength="2000"
        @input="set(i, { url: ($event.target as HTMLInputElement).value })"
        @blur="normalize(i)"
        @keydown="onUrlKeydown(i, $event)"
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
.links-field-grip {
  flex: none;
  width: 18px;
  display: grid;
  place-items: center;
  color: var(--muted);
  cursor: grab;
}
.links-field-grip:active { cursor: grabbing; }
.links-field-grip svg { width: 14px; height: 14px; }
.links-field-grip:hover { color: var(--accent); }
.links-field-row > input { flex: 1; min-width: 0; }
.links-field-title { position: relative; flex: 0 0 220px; display: flex; }
.links-field-title input { width: 100%; padding-right: 32px; }
.links-field-refresh {
  position: absolute;
  right: 6px;
  top: 8px;
  width: 24px; height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.links-field-refresh:hover:not(:disabled) { color: var(--accent); background: var(--bg-soft); }
.links-field-refresh:disabled { opacity: 0.35; cursor: default; }
.links-field-refresh svg { width: 14px; height: 14px; }
.links-field-refresh.is-loading svg { animation: links-spin 0.8s linear infinite; }
@keyframes links-spin { to { transform: rotate(360deg); } }
.links-field-row.is-fetching > input { opacity: 0.6; }
</style>
