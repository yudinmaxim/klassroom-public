import { parseJson, resetPasswordBodySchema, usernameSchema } from '../../../lib/validation'
import { requirePermission } from '../../../utils/can'
import { destroyUserSessions } from '../../../lib/sessions'

/** Сбросить пароль аккаунта (пермишен users.manage). Возвращает пароль один раз. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const body = await parseJson(event, resetPasswordBodySchema)
  const result = await useUserStore().resetPassword(username, body.password)
  // после сброса пароля все активные сессии этого аккаунта гасятся
  await destroyUserSessions(username)
  return result
})
