/**
 * Drag-and-drop ссылок на вложения и внешние ссылки в markdown-редактор.
 * Чипы FileChips кладут имя файла в dataTransfer (FILE_DRAG_MIME),
 * строки LinksField — JSON ссылки (LINK_DRAG_MIME); дроп-обработчик
 * оборачивает payload в markdown и вставляет через MdEditor.insert
 * (в позицию курсора).
 */
export const FILE_DRAG_MIME = 'application/x-klassroom-file'
export const LINK_DRAG_MIME = 'application/x-klassroom-link'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'])

export function isImageFileName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXT.has(ext)
}

/** `![name](name)` для картинок, `[name](name)` для остальных файлов. */
export function attachmentMarkdown(name: string): string {
  return isImageFileName(name) ? `![${name}](${name})` : `[${name}](${name})`
}

function mdEscape(s: string): string {
  return s.replace(/[[\]]/g, '\\$&').replace(/\s+/g, ' ').trim()
}

/** `[title](url)` для внешней ссылки; title может быть пустым → домен. */
export function linkMarkdown(title: string, url: string): string {
  const t = mdEscape(title) || url
  return `[${t}](${url})`
}

export interface MdLinkRef { title: string, url: string }

/**
 * Внешние http(s)-ссылки из markdown-текста (картинки ![] не считаем).
 * Возвращает текст ссылки и URL — для синхронизации в блок «Ссылки».
 */
export function extractExternalLinks(content: string): MdLinkRef[] {
  const out: MdLinkRef[] = []
  const re = /(?<!!)\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+)[^)]*\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    out.push({ title: m[1].trim(), url: m[2] })
  }
  return out
}

export interface TextMatch { index: number, length: number }

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Вхождения markdown-ссылки на файл `name` в тексте:
 * `[текст](name)`, `![alt](name)`, с title и в обёртке `<>`.
 * Учитывает и URL-encoded вариант имени.
 */
export function attachmentRefMatches(content: string, name: string): TextMatch[] {
  if (!name) return []
  const variants = [...new Set([name, encodeURIComponent(name)])]
    .map(escapeRegExp).join('|')
  const re = new RegExp(`!?\\[[^\\]]*\\]\\(\\s*<?(?:${variants})>?(?:\\s+["'][^"']*["'])?\\s*\\)`, 'g')
  const out: TextMatch[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) out.push({ index: m.index, length: m[0].length })
  return out
}
