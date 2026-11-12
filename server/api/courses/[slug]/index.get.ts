import { requireUser, courseSlugSchema } from '../../../lib/validation'
import { httpError } from '../../../lib/errors'

/** Детали курса. roster обогащается псевдонимами из UserStore. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))

  const course = await useContentStore().getCourse(actor, slug)
  if (!course) httpError(404, 'Курс не найден')

  const userStore = useUserStore()
  const roster: Array<{ username: string, pseudonym: string }> = []
  for (const username of course.students) {
    const u = await userStore.getUser(username)
    // аккаунт мог быть удалён — оставляем только живых участников
    if (u) roster.push({ username: u.username, pseudonym: u.pseudonym })
  }

  const canManage = actor.role === 'admin' || (actor.role === 'teacher' && course.teacher === actor.username)
  return { course, roster, canManage }
})
