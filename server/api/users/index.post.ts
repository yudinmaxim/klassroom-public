import { parseJson, createUserBodySchema } from '../../lib/validation'
import { requirePermission } from '../../utils/can'
import { httpError } from '../../lib/errors'

/**
 * Создать аккаунт. Право определяется пермишеном создаваемой роли:
 *  - ученика могут создавать владельцы users.create.student (учитель/админ)
 *  - прочие роли — только владельцы users.create.role.any (админ)
 */
export default defineEventHandler(async (event) => {
  const body = await parseJson(event, createUserBodySchema)
  const code = body.role === 'student' ? 'users.create.student' : 'users.create.role.any'
  await requirePermission(event, code)

  const target = await useRoleStore().getRole(body.role)
  if (!target) httpError(400, `Роль «${body.role}» не существует`)

  return useUserStore().createUser(body)
})
