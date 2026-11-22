import { requirePermission } from '../../utils/can'

/** Все роли платформы (пермишен roles.manage — админ). */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'roles.manage')
  return { roles: await useRoleStore().listRoles() }
})
