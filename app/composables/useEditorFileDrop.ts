import type { Ref } from 'vue'
import {
  FILE_DRAG_MIME,
  LINK_DRAG_MIME,
  attachmentMarkdown,
  linkMarkdown,
} from '~/utils/file-ref'

export interface MdEditorExpose {
  insert: (generate: (selectedText: string) => { targetValue: string, select?: boolean }) => void
  /** CodeMirror view — для поиска/выделения мест в тексте. */
  getEditorView?: () => {
    dispatch: (spec: { selection: { anchor: number, head: number }, scrollIntoView?: boolean }) => void
    focus: () => void
  } | undefined
}

export interface EditorDropOptions {
  /**
   * Файлы, брошенные из ОС на редактор. Должен загрузить их (вернуть
   * имена успешно добавленных) — композабл вставит markdown-ссылки.
   */
  onOsFiles?: (files: File[]) => Promise<string[]>
}

/**
 * Дроп на MdEditor:
 * - чип вложения (FILE_DRAG_MIME) → `![имя](имя)` / `[имя](имя)`;
 * - чип ссылки (LINK_DRAG_MIME) → `[title](url)`;
 * - файлы ОС → onOsFiles, затем markdown-ссылки на загруженные имена.
 * Чужие drag-and-drop не перехватываются.
 */
export function useEditorFileDrop(
  editor: Ref<MdEditorExpose | null | undefined>,
  files: () => string[],
  opts?: EditorDropOptions,
) {
  const dragOver = ref(false)

  const accepts = (types: readonly string[]) =>
    types.includes(FILE_DRAG_MIME)
    || types.includes(LINK_DRAG_MIME)
    || (!!opts?.onOsFiles && types.includes('Files'))

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer || !accepts(e.dataTransfer.types)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    dragOver.value = true
  }

  function onDragLeave(e: DragEvent) {
    const next = e.relatedTarget
    if (next instanceof Node && (e.currentTarget as HTMLElement).contains(next)) return
    dragOver.value = false
  }

  async function onDrop(e: DragEvent) {
    dragOver.value = false
    const dt = e.dataTransfer
    if (!dt) return

    if (dt.types.includes(LINK_DRAG_MIME)) {
      const raw = dt.getData(LINK_DRAG_MIME)
      try {
        const link = JSON.parse(raw) as { title?: string, url?: string }
        if (link.url) {
          e.preventDefault()
          editor.value?.insert(() => ({ targetValue: linkMarkdown(link.title ?? '', link.url ?? '') }))
        }
      } catch { /* битый payload — игнорируем */ }
      return
    }

    if (dt.types.includes(FILE_DRAG_MIME)) {
      const name = dt.getData(FILE_DRAG_MIME) || dt.getData('text/plain')
      if (name && files().includes(name)) {
        e.preventDefault()
        editor.value?.insert(() => ({ targetValue: attachmentMarkdown(name) }))
      }
      return
    }

    if (opts?.onOsFiles && dt.files?.length) {
      e.preventDefault()
      const names = await opts.onOsFiles([...dt.files])
      for (const name of names) {
        editor.value?.insert(() => ({ targetValue: attachmentMarkdown(name) }))
      }
    }
  }

  return { dragOver, onDragover: onDragOver, onDragleave: onDragLeave, onDrop }
}
