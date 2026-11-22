import { requireUser } from '../lib/validation'
import { addSseClient, removeSseClient, type SseSender } from '../lib/events'

/**
 * SSE-канал уведомлений. Кука wr_session авторизует upgrade-запрос;
 * дальше соединение живёт, пока не закроется (heartbeat 25с).
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)

  setResponseHeaders(event, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      const send: SseSender = (data) => {
        try {
          controller.enqueue(encoder.encode(data))
        } catch {
          // соединение уже закрыто
        }
      }
      addSseClient(actor.username, send)

      const heartbeat = setInterval(() => send(':hb\n\n'), 25_000)
      const cleanup = () => {
        clearInterval(heartbeat)
        removeSseClient(actor.username, send)
        try {
          controller.close()
        } catch {
          // уже закрыт
        }
      }
      event.node.req.on('close', cleanup)
    },
  })

  return stream
})
