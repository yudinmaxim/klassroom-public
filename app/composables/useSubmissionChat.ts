import type { NotifyPayload } from '#shared/types'
import { onNotification } from '~/composables/useNotifications'

/**
 * Глобальный чат-drawer по тредам сдач (specs/11).
 * Кнопки на страницах вызывают openThread(ctx); drawer смонтирован в app.vue
 * и ВСЕГДА живёт при навигации — закрывается только явным ×.
 *
 * Непрочитанные — только live-события этой сессии (как и уведомления:
 * эпемерно, офлайн ничего не копится).
 */

export interface ChatContext {
  slug: string
  aid: string
  /** username владельца сдачи, чей тред открываем */
  username: string
  /** подпись в шапке (псевдоним ученика и т.п.) */
  label?: string
}

const open = ref(false)
const ctx = ref<ChatContext | null>(null)
const unread = ref<Record<string, number>>({})

export function chatKey(c: { slug: string, aid: string, username: string }): string {
  return `${c.slug}/${c.aid}/${c.username}`
}

// live-подсчёт непрочитанных — один слушатель на модуль
if (import.meta.client) {
  onNotification((n: NotifyPayload) => {
    if (n.type !== 'comment.created' || !n.username) return
    const m = n.url?.match(/\/assignments\/([^/?]+)/)
    const aidSlug = m?.[1]
    if (!aidSlug || !n.course) return
    const key = chatKey({ slug: n.course, aid: aidSlug, username: n.username })
    const current = ctx.value ? chatKey(ctx.value) : ''
    if (key !== current) unread.value[key] = (unread.value[key] ?? 0) + 1
  })
}

// --- lastSeen для индикации непрочитанных комментариев в списках ---
// localStorage, ключ по курсу+заданию (у ученика один тред на задание).
const SEEN_PREFIX = 'wr_chat_seen_'

export function markChatSeen(slug: string, aid: string): void {
  if (!import.meta.client) return
  localStorage.setItem(`${SEEN_PREFIX}${slug}_${aid}`, new Date().toISOString())
}

export function chatHasUnread(slug: string, aid: string, lastCommentAt?: string | null): boolean {
  if (!import.meta.client || !lastCommentAt) return false
  return lastCommentAt > (localStorage.getItem(`${SEEN_PREFIX}${slug}_${aid}`) ?? '')
}

export function useSubmissionChat() {
  function openThread(c: ChatContext) {
    ctx.value = c
    unread.value[chatKey(c)] = 0
    markChatSeen(c.slug, c.aid)
    open.value = true
  }
  function closeThread() {
    open.value = false
    ctx.value = null
  }

  return { open, ctx, unread, openThread, closeThread, chatKey }
}
