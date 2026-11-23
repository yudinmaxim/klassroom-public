import { requireUser } from '../lib/validation'
import { httpError } from '../lib/errors'
import { normalizeExternalUrl, isHttpUrl } from '#shared/url'

const MAX_BYTES = 300_000
const TIMEOUT_MS = 8_000

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/** og:title приоритетнее <title>; берём первый подходящий тег. */
function extractTitle(html: string): string {
  const ogTag = html.match(/<meta\b[^>]*>/gi)?.find(t => /property=["']og:title["']/i.test(t))
  const og = ogTag?.match(/content=["']([^"']*)["']/i)?.[1]
  if (og) return decodeEntities(og)
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return title ? decodeEntities(title[1].replace(/\s+/g, ' ')) : ''
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    size += value.length
    if (size >= MAX_BYTES) { await reader.cancel(); break }
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/**
 * Подсказка названия для внешней ссылки: скачиваем страницу и вытаскиваем
 * og:title/<title>. Только для авторизованных; http(s), таймаут и лимит
 * размера — чтобы не повесить запрос и не тянуть мегабайты.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const q = getQuery(event)
  const url = normalizeExternalUrl(typeof q.url === 'string' ? q.url : '')
  if (!isHttpUrl(url) || url.length > 2000) {
    httpError(400, 'Некорректная ссылка')
  }

  let res: Response
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': 'klassroom-link-preview/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    })
  } catch {
    httpError(502, 'Не удалось загрузить страницу')
  }
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.includes('text/html')) {
    httpError(502, 'Страница недоступна или это не HTML')
  }
  const html = await readCapped(res)
  return { title: extractTitle(html) }
})
