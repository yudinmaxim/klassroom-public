<script setup lang="ts">
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

/** Модалка предпросмотра файла: рендер по расширению (img/pdf/media/md/text/other). */
const props = defineProps<{
  file: { name: string, url: string } | null
}>()
const emit = defineEmits<{ close: [] }>()

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac'])
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v'])
const MD_EXT = new Set(['md', 'markdown'])
const TEXT_EXT = new Set([
  'txt', 'text', 'log', 'json', 'csv', 'tsv', 'xml', 'yaml', 'yml', 'ini', 'cfg',
  'py', 'js', 'ts', 'vue', 'html', 'htm', 'css', 'scss', 'sql', 'sh', 'env',
])

const ext = computed(() => props.file?.name.split('.').pop()?.toLowerCase() ?? '')
const kind = computed<'image' | 'pdf' | 'audio' | 'video' | 'md' | 'text' | 'other'>(() => {
  if (IMAGE_EXT.has(ext.value)) return 'image'
  if (ext.value === 'pdf') return 'pdf'
  if (AUDIO_EXT.has(ext.value)) return 'audio'
  if (VIDEO_EXT.has(ext.value)) return 'video'
  if (MD_EXT.has(ext.value)) return 'md'
  if (TEXT_EXT.has(ext.value)) return 'text'
  return 'other'
})

// текстовые форматы тянем целиком для <pre>/MdPreview
const text = ref('')
const textLoading = ref(false)
const textError = ref('')
watch(() => props.file, async (f) => {
  text.value = ''
  textError.value = ''
  textLoading.value = false
  if (!f || (kind.value !== 'md' && kind.value !== 'text')) return
  textLoading.value = true
  try {
    const res = await fetch(f.url)
    if (!res.ok) throw new Error(String(res.status))
    text.value = await res.text()
  } catch {
    textError.value = 'Не удалось загрузить файл'
  } finally {
    textLoading.value = false
  }
}, { immediate: true })

// Esc закрывает модалку
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
watch(() => props.file, (f) => {
  if (f) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div v-if="file" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal preview-modal" role="dialog" aria-modal="true" :aria-label="file.name">
      <div class="modal-head">
        <h2 class="preview-name">{{ file.name }}</h2>
        <div class="row" style="gap: 8px;">
          <a class="small" :href="file.url" download>Скачать</a>
          <button class="small" aria-label="Закрыть" @click="emit('close')">×</button>
        </div>
      </div>

      <div class="preview-body">
        <img v-if="kind === 'image'" :src="file.url" :alt="file.name" class="preview-img">
        <iframe v-else-if="kind === 'pdf'" :src="file.url" class="preview-frame" />
        <audio v-else-if="kind === 'audio'" :src="file.url" controls class="preview-audio" />
        <video v-else-if="kind === 'video'" :src="file.url" controls class="preview-video" />
        <template v-else-if="kind === 'md' || kind === 'text'">
          <p v-if="textLoading" class="muted">Загрузка…</p>
          <p v-else-if="textError" class="error">{{ textError }}</p>
          <MdPreview v-else-if="kind === 'md'" :model-value="text" class="preview-md" />
          <pre v-else class="preview-text">{{ text }}</pre>
        </template>
        <div v-else class="preview-fallback">
          <p class="muted">Предпросмотр для этого типа файла недоступен.</p>
          <a class="primary" :href="file.url" download>Скачать файл</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-modal {
  width: min(960px, calc(100vw - 32px));
  height: min(82vh, 900px);
}
.preview-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 70%;
}
.preview-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  margin: auto;
}
.preview-frame {
  flex: 1;
  width: 100%;
  min-height: 60vh;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #525659;
}
.preview-video { width: 100%; max-height: 100%; margin: auto; }
.preview-audio { margin: auto; width: 100%; max-width: 480px; }
.preview-text {
  margin: 0;
  padding: 12px;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--bg-soft, #f6f6f6);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.preview-md { font-size: 14px; }
.preview-fallback {
  margin: auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}
</style>
