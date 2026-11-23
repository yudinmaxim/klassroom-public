import type { Ref } from 'vue'
import { FILE_DRAG_MIME, attachmentMarkdown } from '~/utils/file-ref'

export interface MdEditorExpose {
  insert: (generate: (selectedText: string) => { targetValue: string, select?: boolean }) => void
}

/**
 * Дроп чипа вложения на MdEditor: вставляет `![имя](имя)` / `[имя](имя)`
 * в позицию курсора. Принимает только файлы из переданного списка —
 * обычный drag-and-drop текста/файлов ОС не перехватывается.
 */
export function useEditorFileDrop(
  editor: Ref<MdEditorExpose | null | undefined>,
  files: () => string[],
) {
  const dragOver = ref(false)

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(FILE_DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    dragOver.value = true
  }

  function onDragLeave(e: DragEvent) {
    const next = e.relatedTarget
    if (next instanceof Node && (e.currentTarget as HTMLElement).contains(next)) return
    dragOver.value = false
  }

  function onDrop(e: DragEvent) {
    dragOver.value = false
    const dt = e.dataTransfer
    const name = dt?.getData(FILE_DRAG_MIME) || dt?.getData('text/plain')
    if (!name || !files().includes(name)) return
    e.preventDefault()
    editor.value?.insert(() => ({ targetValue: attachmentMarkdown(name) }))
  }

  return { dragOver, onDragover: onDragOver, onDragleave: onDragLeave, onDrop }
}
