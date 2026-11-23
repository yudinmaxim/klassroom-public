<script setup lang="ts">
/** Чипы-ссылки на файлы: первые 3 видны, остальные — за выпадашкой «… ещё N».
 *  Клик открывает модалку предпросмотра; href сохраняется для контекстного меню.
 *  Опциональный removeFile добавляет крестик удаления на чипы. */
const props = defineProps<{
  files: string[]
  hrefFor?: (name: string) => string
  removeFile?: (name: string) => void
}>()

const VISIBLE = 3
const visible = computed(() => props.files.slice(0, VISIBLE))
const hidden = computed(() => props.files.slice(VISIBLE))

// дропдаун «… ещё N» закрывается кликом вне его
const rootEl = ref<HTMLElement | null>(null)
function onDocClick(e: MouseEvent) {
  const d = rootEl.value?.querySelector('details[open]')
  if (d && !d.contains(e.target as Node)) d.removeAttribute('open')
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

// предпросмотр файла в модалке
const preview = ref<{ name: string, url: string } | null>(null)
function openPreview(name: string) {
  if (!props.hrefFor) return
  rootEl.value?.querySelector('details[open]')?.removeAttribute('open')
  preview.value = { name, url: props.hrefFor(name) }
}
function onChipClick(name: string, e: MouseEvent) {
  if (!props.hrefFor) return
  e.preventDefault()
  openPreview(name)
}
</script>

<template>
  <div ref="rootEl" class="file-chips">
    <span v-for="n in visible" :key="n" class="file-chip-wrap">
      <component
        :is="hrefFor ? 'a' : 'span'"
        class="file-chip"
        :href="hrefFor?.(n)"
        @click="onChipClick(n, $event)"
      >
        <Icon name="lucide:paperclip" />{{ n }}
      </component>
      <button
        v-if="removeFile"
        class="chip-x"
        :aria-label="`Удалить ${n}`"
        @click="removeFile(n)"
      >×</button>
    </span>
    <details v-if="hidden.length" class="files-more">
      <summary class="file-chip">… ещё {{ hidden.length }}</summary>
      <div class="files-more-list">
        <div v-for="n in hidden" :key="n" class="files-more-row">
          <component
            :is="hrefFor ? 'a' : 'span'"
            :href="hrefFor?.(n)"
            @click="onChipClick(n, $event)"
          >{{ n }}</component>
          <button
            v-if="removeFile"
            class="chip-x"
            :aria-label="`Удалить ${n}`"
            @click="removeFile(n)"
          >×</button>
        </div>
      </div>
    </details>
    <FilePreviewModal :file="preview" @close="preview = null" />
  </div>
</template>

<style scoped>
.file-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
.file-chip-wrap { position: relative; display: inline-flex; }
.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 999px;
}
a.file-chip:hover { border-color: var(--accent); }
.file-chip svg { width: 13px; height: 13px; flex: none; }
.chip-x {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  padding: 0;
  display: grid;
  place-items: center;
  font-size: 11px;
  line-height: 1;
  color: #fff;
  background: var(--danger, #d64545);
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
.files-more { position: relative; }
.files-more > summary {
  list-style: none;
  cursor: pointer;
  user-select: none;
}
.files-more > summary::-webkit-details-marker { display: none; }
.files-more-list {
  position: absolute;
  z-index: 5;
  top: calc(100% + 4px);
  left: 0;
  min-width: 200px;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  padding: 6px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(35, 42, 53, 0.12);
}
.files-more-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.files-more-row > a,
.files-more-row > span {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  font-size: 13px;
  color: var(--ink);
  text-decoration: none;
  border-radius: 6px;
  overflow-wrap: anywhere;
}
a.files-more-row > a:hover { background: var(--bg-soft, #f6f6f6); }
.files-more-row .chip-x {
  position: static;
  flex: none;
}
</style>
