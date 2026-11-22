import { z } from 'zod'
import { parseJson, roleNameParamSchema, pseudonymSchema, usernameSchema } from '../../../lib/validation'
import { requirePermission } from '../../../utils/can'
import { httpError } from '../../../lib/errors'

/** Обновить аккаунт (пермишен users.manage). Сессии не гасим — роль подхватится сама. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const body = await parseJson(event, z.object({
    pseudonym: pseudonymSchema.optional(),
    role: roleNameParamSchema.optional(),
  }).refine(
    v => v.pseudonym !== undefined || v.role !== undefined,
    'Укажите псевдоним и/или роль',
  ))

  if (body.role && !(await useRoleStore().getRole(body.role))) {
    httpError(400, `Роль «${body.role}» не существует`)
  }

  const user = await useUserStore().updateUser(username, body)
  return { user }
})
