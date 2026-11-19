import { filterKnownPermissions } from '../../lib/permissions'
import { requirePermission } from '../../utils/can'
import { parseJson, roleNameParamSchema, saveRoleBodySchema } from '../../lib/validation'
import { httpError } from '../../lib/errors'
import { z } from 'zod'

/** Создать собственную роль (пермишен roles.manage). */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'roles.manage')
  const body = await parseJson(event, z.object({ name: roleNameParamSchema }).and(saveRoleBodySchema))

  const store = useRoleStore()
  if (await store.getRole(body.name)) httpError(409, `Роль «${body.name}» уже существует`)

  const def = await store.saveRole({
    name: body.name,
    title: body.title,
    scope: body.scope,
    permissions: filterKnownPermissions(body.permissions),
  })
  return { role: def }
})
