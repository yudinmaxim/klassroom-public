import { setupBodySchema, parseJson } from '../../lib/validation'
import { createSession } from '../../lib/sessions'
import { httpError } from '../../lib/errors'
import { isRateLimited, recordFailure, clearFailures } from '../../lib/rate-limit'
import { timingSafeEqual } from 'node:crypto'

/** Создать первого администратора. Закрыт навсегда после первого аккаунта. */
export default defineEventHandler(async (event) => {
  const store = useUserStore()
  if ((await store.countUsers()) !== 0) {
    httpError(409, 'Первичный администратор уже создан')
  }

  const config = useRuntimeConfig()
  if (!config.setupSecret) httpError(503, 'Первичная настройка отключена: секрет не задан')

  const key = 'initial-setup'
  if (isRateLimited(key)) httpError(429, 'Слишком много попыток, подождите 15 минут')

  const body = await parseJson(event, setupBodySchema)
  const supplied = Buffer.from(body.setupSecret)
  const expected = Buffer.from(config.setupSecret)
  const matches = supplied.length === expected.length && timingSafeEqual(supplied, expected)
  if (!matches) {
    recordFailure(key)
    httpError(403, 'Неверный секрет первичной настройки')
  }

  clearFailures(key)
  const { setupSecret: _setupSecret, ...account } = body
  const { user } = await store.createUser({ ...account, role: 'admin' })
  await createSession(event, user)
  return { user }
})
