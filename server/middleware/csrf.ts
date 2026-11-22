/**
 * CSRF-защита мутаций (specs/06-deployment.md): для браузерных запросов
 * проверяем, что Origin совпадает с Host запроса. Небраузерные клиенты
 * (curl) Origin не присылают — их контролирует аутентификация по куке.
 */
export default defineEventHandler((event) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method)) return

  const origin = getRequestHeader(event, 'origin')
  if (!origin) return

  const host = getRequestHeader(event, 'host')
  let originHost: string | null = null
  try {
    originHost = new URL(origin).host
  } catch {
    // некорректный Origin — считаем несовпадением (originHost остаётся null)
  }
  if (!originHost || originHost !== host) {
    throw createError({ statusCode: 403, message: 'Запрос отклонён (CSRF)' })
  }
})
