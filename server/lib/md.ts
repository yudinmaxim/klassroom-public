import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import sanitizeHtml from 'sanitize-html'
import { slugify } from './slug'
import type { RenderedMaterial, TocEntry } from '../ports/material-plugin'

/**
 * Рендерер плагина doc (specs/05, шаг 3): markdown → санитизированный HTML.
 *
 * Особенности:
 *  - raw HTML в markdown игнорируется (html: false) + санитизация после;
 *  - заголовки 2–3 уровня получают стабильные id → оглавление (TOC);
 *  - `[[slug]]` — внутренние ссылки между материалами курса;
 *  - `![alt](файл.png)` / `[текст](файл.pdf)` — вложения материала,
 *    пути переписываются на API-выдачу с проверкой прав.
 */

// Автоопределение языка для фенсов без ```lang: только уверенные совпадения,
// чтобы не раскрашивать обычный текст случайными токенами.
const AUTO_LANGS = [
  'python', 'javascript', 'typescript', 'json', 'bash', 'shell', 'sql',
  'html', 'xml', 'css', 'yaml', 'cpp', 'c', 'java',
]
const PLAIN_LANGS = new Set(['text', 'plain', 'plaintext', 'txt'])
const AUTO_MIN_RELEVANCE = 3

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  // подсветка кода в fenced-блоках ```lang (highlight.js, common-сборка)
  highlight(code, lang) {
    try {
      if (lang) {
        if (hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        }
        if (PLAIN_LANGS.has(lang.toLowerCase())) return ''
      }
      const auto = hljs.highlightAuto(code, AUTO_LANGS)
      if (auto.relevance >= AUTO_MIN_RELEVANCE) return auto.value
    } catch { /* fallthrough — обычный вывод */ }
    return ''
  },
})

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code', 'kbd', 'span',
    'a', 'img',
    'strong', 'em', 'del', 's', 'sup', 'sub', 'mark',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'figure', 'figcaption',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'],
    span: ['class'],
    th: ['style'],
    td: ['style'],
  },
  allowedClasses: {
    code: [/^language-/],
    span: [/^hljs/],
  },
  allowedStyles: {
    th: { 'text-align': [/^left$/, /^right$/, /^center$/] },
    td: { 'text-align': [/^left$/, /^right$/, /^center$/] },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // относительные пути (/api/..., /courses/...) разрешены по умолчанию
  allowProtocolRelative: false,
}

interface RenderCtx {
  courseSlug: string
  materialSlug: string
  /** title'ы материалов курса — для текста `[[ссылок]]`; могут отсутствовать. */
  linkTitles?: Record<string, string>
  /** Вложения материала (переопределяем только известные файлы). */
  attachments: string[]
}

/** Заменить [[slug]] на markdown-ссылки (по материалам курса). */
function rewriteWikiLinks(source: string, ctx: RenderCtx): string {
  return source.replace(/\[\[([a-z0-9][a-z0-9-]*)\]\]/gi, (_, slug: string) => {
    const s = slug.toLowerCase()
    const title = ctx.linkTitles?.[s] ?? s
    return `[${title}](/courses/${ctx.courseSlug}/topics/${s})`
  })
}

/** Переписать относительные пути-вложения на URL выдачи API. */
function rewriteAttachments(source: string, ctx: RenderCtx): string {
  const known = new Set(ctx.attachments)
  return source.replace(/(\]\()(?![a-z]+:\/\/|\/|#)([^)\s]+)(\))/g, (full, open, target, close) => {
    const name = decodeURIComponent(target)
    if (!known.has(name)) return full
    const encoded = encodeURIComponent(name)
    return `${open}/api/courses/${ctx.courseSlug}/topics/${ctx.materialSlug}/attachments/${encoded}${close}`
  })
}

/** Слаг для заголовка (латиница/кириллица → kebab, повторам — суффикс). */
class Slugger {
  private counts = new Map<string, number>()

  slug(text: string): string {
    const base = slugify(text) || 'razdel'
    const n = (this.counts.get(base) ?? 0) + 1
    this.counts.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  }
}

/** Открыть/переопределить выдачу одного html. Возвращает { html, toc }. */
export function renderDocMarkdown(source: string, ctx: RenderCtx): RenderedMaterial {
  const slugger = new Slugger()
  const toc: TocEntry[] = []

  const prepared = rewriteAttachments(rewriteWikiLinks(source, ctx), ctx)

  // один проход по токенам: проставить id заголовкам и собрать оглавление
  const tokens = md.parse(prepared, {})
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type === 'heading_open' && (t.tag === 'h2' || t.tag === 'h3')) {
      const inline = tokens[i + 1]
      const text = (inline?.content ?? '').trim()
      const id = slugger.slug(text)
      t.attrSet('id', id)
      toc.push({ id, text, level: t.tag === 'h2' ? 2 : 3 })
    }
  }

  const raw = md.renderer.render(tokens, md.options, {})
  const html = sanitizeHtml(raw, SANITIZE_OPTIONS)
  return { html, toc }
}
