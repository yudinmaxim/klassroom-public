import { requireRole, parseJson, rosterBodySchema, courseSlugSchema, usernameSchema } from '../../../lib/validation'
import { httpError } from '../../../lib/errors'

/**
 * Зачислить/исключить ученика (владелец курса или admin).
 * Существование аккаунта и его роль проверяются здесь (UserStore), сам roster
 * меняет ContentStore — два порта, каждый про своё (specs/01).
 */
export default defineEventHandler(async (event) => {
  const actor = await requireRole(event, 'admin', 'teacher')
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const body = await parseJson(event, rosterBodySchema)

  if (body.action === 'add') {
    const target = await useUserStore().getUser(body.username)
    if (!target) httpError(404, `Пользователь «${body.username}» не найден`)
    if (target.role !== 'student') httpError(400, 'Зачислить можно только ученика (student)')
  }

  const store = useContentStore()
  const course = body.action === 'add'
    ? await store.addStudent(actor, slug, body.username)
    : await store.removeStudent(actor, slug, usernameSchema.parse(body.username))
  return { course }
})
