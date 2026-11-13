import type { NotifyPayload } from '#shared/types'
import { onNotification } from '~/composables/useNotifications'

/**
 * Глобальный чат- drawer по тредам сдач (specs/11).
 * Кнопки на страницах вызывают openThread(ctx); drawer смонтирован в app.vue
 * и живёт независимо от роута. «Закрепить» — панель не закрывается
 * при навигации; без закрепа — закрывается при смене страницы.
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
const pinned = ref(false)
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

export function useSubmissionChat() {
  function openThread(c: ChatContext) {
    ctx.value = c
    unread.value[chatKey(c)] = 0
    open.value = true
  }
  function closeThread() {
    open.value = false
    ctx.value = null
  }
  function togglePin() {
    pinned.value = !pinned.value
  }
  /** Вызывается drawer'ом при смене роута. */
  function onRouteChange() {
    if (!pinned.value) closeThread()
  }

  return { open, pinned, ctx, unread, openThread, closeThread, togglePin, onRouteChange, chatKey }
}
