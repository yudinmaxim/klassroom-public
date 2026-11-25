<script setup lang="ts">
import { MdPreview } from 'md-editor-v3'
import { highlightText } from '@speed-highlight/core'
import 'md-editor-v3/lib/style.css'
import '@speed-highlight/core/themes/github-light.css'

/** Модалка предпросмотра файла: рендер по расширению (img/pdf/media/md/csv/text/other). */
const props = withDefaults(defineProps<{
  file: { name: string, url: string } | null
  /** Все файлы набора — для циклической навигации стрелками */
  files?: { name: string, url: string }[]
}>(), { files: () => [] })
const emit = defineEmits<{ close: [], nav: [dir: number] }>()

const fileIndex = computed(() =>
  props.files.findIndex(f => f.url === props.file?.url),
)
const hasNav = computed(() => props.files.length > 1 && fileIndex.value >= 0)
const prevFile = computed(() =>
  hasNav.value ? props.files[(fileIndex.value - 1 + props.files.length) % props.files.length] : null,
)
const nextFile = computed(() =>
  hasNav.value ? props.files[(fileIndex.value + 1) % props.files.length] : null,
)

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac'])
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v'])
const MD_EXT = new Set(['md', 'markdown'])
const TEXT_EXT = new Set([
  'txt', 'text', 'log', 'json', 'js', 'mjs', 'ts', 'vue', 'html', 'htm', 'css', 'scss',
  'sql', 'sh', 'bash', 'env', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'toml', 'py',
])

const ext = computed(() => props.file?.name.split('.').pop()?.toLowerCase() ?? '')
const kind = computed<'image' | 'pdf' | 'audio' | 'video' | 'md' | 'csv' | 'text' | 'other'>(() => {
  if (IMAGE_EXT.has(ext.value)) return 'image'
  if (ext.value === 'pdf') return 'pdf'
  if (AUDIO_EXT.has(ext.value)) return 'audio'
  if (VIDEO_EXT.has(ext.value)) return 'video'
  if (MD_EXT.has(ext.value)) return 'md'
  if (ext.value === 'csv') return 'csv'
  if (TEXT_EXT.has(ext.value)) return 'text'
  return 'other'
})

// текстовые форматы тянем целиком для <pre>/таблицы/MdPreview/подсветки
const highlighted = ref('')
const text = ref('')
const textLoading = ref(false)
const textError = ref('')
const NEED_TEXT = new Set(['md', 'csv', 'text'])
watch(() => props.file, async (f) => {
  text.value = ''
  highlighted.value = ''
  textError.value = ''
  textLoading.value = false
  if (!f || !NEED_TEXT.has(kind.value)) return
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

// подсветка кода для текстовых файлов (speed-highlight, язык по расширению)
const HL_LANG: Record<string, string> = {
  py: 'py', json: 'json', js: 'js', mjs: 'js', ts: 'ts', html: 'html', htm: 'html',
  vue: 'html', css: 'css', scss: 'css', sql: 'sql', sh: 'bash', bash: 'bash',
  yaml: 'yaml', yml: 'yaml', xml: 'xml', ini: 'ini', cfg: 'ini', toml: 'toml',
  log: 'log', env: 'ini', txt: 'plain', text: 'plain',
}
// json показываем с отступами (pretty-print), остальное — как есть
const displayText = computed(() => {
  if (ext.value === 'json' && text.value) {
    try { return JSON.stringify(JSON.parse(text.value), null, 2) } catch { /* сырой текст */ }
  }
  return text.value
})
watch([displayText, () => ext.value], async ([src]) => {
  highlighted.value = ''
  if (!src || kind.value !== 'text') return
  try {
    highlighted.value = await highlightText(src, (HL_LANG[ext.value] ?? 'plain') as never, true)
  } catch {
    highlighted.value = ''
  }
})

// csv → таблица (первая строка — заголовок)
const csvRows = computed(() => {
  if (kind.value !== 'csv' || !text.value) return []
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQ = false
  for (let i = 0; i < text.value.length; i++) {
    const c = text.value[i]!
    if (inQ) {
      if (c === '"') {
        if (text.value[i + 1] === '"') { cell += '"'; i++ } else inQ = false
      } else cell += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text.value[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
})

// Esc закрывает, ←/→ листают файлы по кругу
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowLeft' && props.files.length > 1) emit('nav', -1)
  else if (e.key === 'ArrowRight' && props.files.length > 1) emit('nav', 1)
}
let keyBound = false
watch(() => props.file, (f) => {
  if (f && !keyBound) {
    document.addEventListener('keydown', onKeydown)
    keyBound = true
  } else if (!f && keyBound) {
    document.removeEventListener('keydown', onKeydown)
    keyBound = false
  }
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <BaseModal
    v-if="file"
    :title="file.name"
    width="min(960px, calc(100vw - 32px))"
    height="min(82vh, 900px)"
    @close="emit('close')"
  >
    <template #head>
      <div class="modal-head">
        <h2 class="preview-name">{{ file.name }}</h2>
        <div class="row" style="gap: 8px;">
          <template v-if="hasNav">
            <span class="tip">
              <button class="icon-btn" :aria-label="`Предыдущий файл: ${prevFile?.name}`" @click="emit('nav', -1)">
                <Icon name="lucide:chevron-left" />
              </button>
              <span class="tip-body tip-file">{{ prevFile?.name }}</span>
            </span>
            <span class="muted preview-count">{{ fileIndex + 1 }}/{{ files.length }}</span>
            <span class="tip">
              <button class="icon-btn" :aria-label="`Следующий файл: ${nextFile?.name}`" @click="emit('nav', 1)">
                <Icon name="lucide:chevron-right" />
              </button>
              <span class="tip-body tip-file">{{ nextFile?.name }}</span>
            </span>
          </template>
          <span class="tip">
            <a class="icon-btn dl" :href="file.url" download aria-label="Скачать файл">
              <Icon name="lucide:download" />
            </a>
            <span class="tip-body">Скачать</span>
          </span>
          <button class="icon-btn" aria-label="Закрыть" @click="emit('close')">
            <Icon name="lucide:x" />
          </button>
        </div>
      </div>
    </template>

      <div class="preview-body">
        <img v-if="kind === 'image'" :src="file.url" :alt="file.name" class="preview-img">
        <iframe v-else-if="kind === 'pdf'" :src="file.url" class="preview-frame" />
        <audio v-else-if="kind === 'audio'" :src="file.url" controls class="preview-audio" />
        <video v-else-if="kind === 'video'" :src="file.url" controls class="preview-video" />
        <template v-else-if="NEED_TEXT.has(kind)">
          <p v-if="textLoading" class="muted">Загрузка…</p>
          <p v-else-if="textError" class="error">{{ textError }}</p>
          <template v-else>
            <MdPreview v-if="kind === 'md'" :model-value="text" class="preview-md" />
            <div v-else-if="kind === 'csv' && csvRows.length" class="preview-csv">
              <table>
                <thead>
                  <tr><th v-for="(c, i) in csvRows[0]" :key="i">{{ c }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(r, ri) in csvRows.slice(1)" :key="ri">
                    <td v-for="(c, ci) in r" :key="ci">{{ c }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <!-- eslint-disable-next-line vue/no-v-html -- подсветка экранирует исходник -->
            <div v-else-if="kind === 'text' && highlighted" class="shj-lang-code preview-code" v-html="highlighted" />
            <pre v-else class="preview-text">{{ displayText }}</pre>
          </template>
        </template>
        <div v-else class="preview-fallback">
          <p class="muted">Предпросмотр для этого типа файла недоступен.</p>
          <a class="primary" :href="file.url" download>Скачать файл</a>
        </div>
      </div>
  </BaseModal>
</template>

<style scoped>
.preview-count { font-size: 12px; white-space: nowrap; }
.tip-file { overflow-wrap: anywhere; }
.dl {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  text-decoration: none;
}
.dl:hover { border-color: var(--accent); color: var(--accent); }
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
  font-family: Consolas, 'Courier New', Monaco, monospace;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--bg-soft, #f6f6f6);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.preview-code {
  font-family: Consolas, 'Courier New', Monaco, monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre;
  background: var(--bg-soft, #f6f6f6);
  border: 1px solid var(--line);
  border-radius: 8px;
  margin: 0;
  padding: 8px 12px;
  overflow: auto;
}
.preview-csv {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.preview-csv table { border-collapse: collapse; width: 100%; font-size: 13px; }
.preview-csv th, .preview-csv td {
  border: 1px solid var(--line);
  padding: 6px 10px;
  text-align: left;
  white-space: nowrap;
}
.preview-csv th { background: var(--bg-soft, #f6f6f6); }
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
