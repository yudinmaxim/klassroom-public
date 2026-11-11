import { setupBodySchema, parseJson } from '../../lib/validation'
import { createSession } from '../../lib/sessions'
import { httpError } from '../../lib/errors'

/** Создать первого администратора. Закрыт навсегда после первого аккаунта. */
export default defineEventHandler(async (event) => {
  const store = useUserStore()
  if ((await store.countUsers()) !== 0) {
    httpError(409, 'Первичный администратор уже создан')
  }

  const body = await parseJson(event, setupBodySchema)
  const { user } = await store.createUser({ ...body, role: 'admin' })
  await createSession(event, user)
  return { user }
})
