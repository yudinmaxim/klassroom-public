/**
 * Drag-and-drop ссылок на вложения в markdown-редактор.
 * Чипы FileChips кладут имя файла в dataTransfer (FILE_DRAG_MIME),
 * дроп-обработчик оборачивает его в markdown-ссылку и вставляет
 * через MdEditor.insert (в позицию курсора).
 */
export const FILE_DRAG_MIME = 'application/x-klassroom-file'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'])

export function isImageFileName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXT.has(ext)
}

/** `![name](name)` для картинок, `[name](name)` для остальных файлов. */
export function attachmentMarkdown(name: string): string {
  return isImageFileName(name) ? `![${name}](${name})` : `[${name}](${name})`
}
