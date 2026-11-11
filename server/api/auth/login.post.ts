import { loginBodySchema, parseJson } from '../../lib/validation'
import { createSession } from '../../lib/sessions'
import { isRateLimited, recordFailure, clearFailures } from '../../lib/rate-limit'

/** Вход по псевдониму-логину + пароль. Сообщение об ошибке не уточняет, */
/** что именно неверно (specs/06-deployment.md). */
export default defineEventHandler(async (event) => {
  const body = await parseJson(event, loginBodySchema)
  const key = `login:${body.username}`

  if (isRateLimited(key)) {
    throw createError({ statusCode: 429, message: 'Слишком много попыток, подождите немного' })
  }

  const user = await useUserStore().authenticate(body.username, body.password)
  if (!user) {
    recordFailure(key)
    throw createError({ statusCode: 401, message: 'Неверный логин или пароль' })
  }

  clearFailures(key)
  await createSession(event, user)
  return { user }
})
