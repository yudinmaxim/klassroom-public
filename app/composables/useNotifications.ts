import type { NotifyPayload } from '#shared/types'

/**
 * Эфемерные уведомления по SSE (GET /notify). Подключение — только на
 * клиенте; EventSource сам переподключается. Сервер отвечает 401 без
 * сессии — соединение просто закрывается, ошибки наружу не идут.
 */
const TOAST_TTL_MS = 8_000
const MAX_TOASTS = 4

// EventSource не сериализуется — держим в модульной переменной, не в useState
let source: EventSource | null = null

export function useNotifications() {
  const toasts = useState<NotifyPayload[]>('notification-toasts', () => [])

  function push(payload: NotifyPayload) {
    toasts.value = [...toasts.value, payload].slice(-MAX_TOASTS)
    const id = payload.at + payload.type + payload.url
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.at + t.type + t.url !== id)
    }, TOAST_TTL_MS)
  }

  function dismiss(payload: NotifyPayload) {
    toasts.value = toasts.value.filter(t => t !== payload)
  }

  onMounted(() => {
    if (source || !import.meta.client) return
    const es = new EventSource('/notify')
    source = es
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as NotifyPayload
        push(payload)
      } catch {
        // не-JSON кадры игнорируем
      }
    }
  })

  return { toasts, dismiss }
}
