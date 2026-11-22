import { requirePermission } from '../../utils/can'

/** Список всех аккаунтов платформы (пермишен users.view.platform — только админ). */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.view.platform')
  return { users: await useUserStore().listUsers() }
})
