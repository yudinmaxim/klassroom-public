import { requirePermission } from '../../../utils/can'
import { roleNameParamSchema } from '../../../lib/validation'
import { httpError } from '../../../lib/errors'

/**
 * Удалить роль (пермишен roles.manage).
 *  - builtin: файл роли = переопределение; удаление возвращает системный набор.
 *  - custom: удаление только если роль никому не назначена.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'roles.manage')
  const name = roleNameParamSchema.parse(getRouterParam(event, 'name'))
  if (name === 'admin') httpError(400, 'Роль «admin» системная и не удаляется')

  const role = await useRoleStore().getRole(name)
  if (!role) httpError(404, `Роль «${name}» не найдена`)

  if (!role.builtin) {
    const inUse = (await useUserStore().listUsers()).some(u => u.role === name)
    if (inUse) httpError(409, `Роль «${name}» назначена пользователям — сначала смените им роль`)
  }

  await useRoleStore().deleteRole(name)
  return { ok: true, resetToDefault: role.builtin }
})
