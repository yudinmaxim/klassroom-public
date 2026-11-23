import { computed, ref } from 'vue'

export interface PreviewFile { name: string, url: string }

/**
 * Состояние модалки предпросмотра файла.
 * `sel` — открытый файл (может не входить в list → навигации не будет).
 */
export function useFilePreview(getFiles: () => PreviewFile[]) {
  const sel = ref<PreviewFile | null>(null)

  const idx = computed(() => {
    if (!sel.value) return -1
    return getFiles().findIndex(f => f.url === sel.value?.url)
  })

  function open(f: PreviewFile) {
    sel.value = f
  }

  function nav(dir: number) {
    const list = getFiles()
    const i = idx.value
    if (list.length < 2 || i < 0) return
    sel.value = list[(i + dir + list.length) % list.length]
  }

  function close() {
    sel.value = null
  }

  return { sel, idx, open, nav, close }
}
