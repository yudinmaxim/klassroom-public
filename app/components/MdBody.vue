<script setup lang="ts">
import type { PreviewFile } from '~/composables/useFilePreview'

/**
 * Рендер markdown-html + перехват кликов по вложениям:
 * ссылки `/api/.../attachments/<name>` и картинки с такими src
 * открываются в FilePreviewModal вместо перехода/скачивания.
 * `files` — соседние файлы для циклической навигации в модалке.
 */
const props = withDefaults(defineProps<{
  html: string
  files?: PreviewFile[]
}>(), { files: undefined })

const previewFiles = computed(() => props.files ?? [])
const { sel, open, nav, close } = useFilePreview(() => previewFiles.value)

function fileFromUrl(raw: string | null): PreviewFile | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw, window.location.origin)
  } catch {
    return null
  }
  // только свои API-ссылки на вложения — внешние ссылки не трогаем
  if (url.origin !== window.location.origin || !url.pathname.includes('/attachments/')) return null
  const name = decodeURIComponent(url.pathname.split('/').pop() ?? '')
  if (!name) return null
  const rel = url.pathname + url.search
  const known = previewFiles.value.find(f => f.url === rel || f.name === name)
  return known ?? { name, url: rel }
}

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const img = target.closest('img')
  const a = target.closest('a')
  const el = img ?? a
  if (!el) return
  const f = fileFromUrl(img ? img.getAttribute('src') : a?.getAttribute('href') ?? null)
  if (!f) return
  e.preventDefault()
  open(f)
}
</script>

<template>
  <div class="md-body" @click="onClick">
    <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере -->
    <div v-html="html" />
    <FilePreviewModal
      :file="sel"
      :files="previewFiles"
      @close="close"
      @nav="nav"
    />
  </div>
</template>
