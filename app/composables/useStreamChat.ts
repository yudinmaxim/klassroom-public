import type { NotifyPayload } from '#shared/types'
import { onNotification } from '~/composables/useNotifications'

/**
 * Глобальный чат-drawer по тредам постов ленты.
 * Кнопки на постах вызывают openThread(ctx); drawer смонтирован в app.vue
 * и ВСЕГДА живёт при навигации — закрывается только явным ×.
 */

export interface StreamChatContext {
  slug: string
  /** id поста ленты */
  pid: string
  /** подпись в шапке (псевдоним автора + первые слова текста) */
  label?: string
}

const open = ref(false)
const ctx = ref<StreamChatContext | null>(null)
const unread = ref<Record<string, number>>({})

export function streamChatKey(c: { slug: string, pid: string }): string {
  return `${c.slug}/${c.pid}`
}

// live-подсчёт непрочитанных
if (import.meta.client) {
  onNotification((n: NotifyPayload) => {
    if (n.type !== 'stream.comment.created') return
    const m = n.url?.match(/\/stream\?p=([^&]+)/)
    const pid = m?.[1]
    if (!pid || !n.course) return
    const key = streamChatKey({ slug: n.course, pid })
    const current = ctx.value ? streamChatKey(ctx.value) : ''
    if (key !== current) unread.value[key] = (unread.value[key] ?? 0) + 1
  })
}

// --- lastSeen для индикации непрочитанных комментариев ---
const SEEN_PREFIX = 'wr_stream_seen_'

export function markStreamSeen(slug: string, pid: string): void {
  if (!import.meta.client) return
  localStorage.setItem(`${SEEN_PREFIX}${slug}_${pid}`, new Date().toISOString())
}

export function streamHasUnread(slug: string, pid: string, lastCommentAt?: string | null): boolean {
  if (!import.meta.client || !lastCommentAt) return false
  return lastCommentAt > (localStorage.getItem(`${SEEN_PREFIX}${slug}_${pid}`) ?? '')
}

export function useStreamChat() {
  function openThread(c: StreamChatContext) {
    ctx.value = c
    unread.value[streamChatKey(c)] = 0
    markStreamSeen(c.slug, c.pid)
    open.value = true
  }
  function closeThread() {
    open.value = false
    ctx.value = null
  }

  return { open, ctx, unread, openThread, closeThread, streamChatKey }
}
