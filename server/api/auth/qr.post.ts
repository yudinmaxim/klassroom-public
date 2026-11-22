import { z } from 'zod'
import { parseJson } from '../../lib/validation'
import { createSession } from '../../lib/sessions'
import { isRateLimited } from '../../lib/rate-limit'

const bodySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/),
})

/**
 * Вход по QR-токену (спека 09): проверяем и сжигаем токен, создаём
 * обычную сессию. Общий rate-limit с обычным входом (ключ `qr`).
 */
export default defineEventHandler(async (event) => {
  const { token } = await parseJson(event, bodySchema)
  const key = 'qr-login'

  if (isRateLimited(key)) {
    throw createError({ statusCode: 429, message: 'Слишком много попыток, подождите немного' })
  }

  const username = await useQrTokens().consume(token)
  if (!username) {
    throw createError({ statusCode: 410, message: 'Ссылка устарела или уже использована' })
  }

  const user = await useUserStore().getUser(username)
  if (!user) {
    throw createError({ statusCode: 410, message: 'Аккаунт не найден' })
  }

  await createSession(event, user)
  return { user }
})
