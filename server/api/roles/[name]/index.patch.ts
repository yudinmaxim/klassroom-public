import { builtinDefaultsFor, filterKnownPermissions } from '../../../lib/permissions'
import { requirePermission } from '../../../utils/can'
import { parseJson, saveRoleBodySchema, roleNameParamSchema } from '../../../lib/validation'
import { httpError } from '../../../lib/errors'

/** Обновить роль (пермишен roles.manage). Роль admin системная — править нельзя. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'roles.manage')
  const name = roleNameParamSchema.parse(getRouterParam(event, 'name'))
  if (name === 'admin') httpError(400, 'Роль «admin» системная и не редактируется')
  const body = await parseJson(event, saveRoleBodySchema)

  const store = useRoleStore()
  const existing = await store.getRole(name)
  if (!existing) httpError(404, `Роль «${name}» не найдена`)

  const def = await store.saveRole({
    name,
    title: body.title,
    scope: body.scope,
    permissions: filterKnownPermissions(body.permissions),
  })
  return { role: def }
})
