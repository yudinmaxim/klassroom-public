import { requireUser, courseSlugSchema } from '../../../lib/validation'
import { httpError } from '../../../lib/errors'
import { canOnCourse } from '../../../utils/can'

/** Состав курса — только при courses.roster.view (как вкладка «Учащиеся»). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))

  const course = await useContentStore().getCourse(actor, slug)
  if (!course) httpError(404, 'Курс не найден')
  if (!await canOnCourse(actor, 'courses.roster.view', course)) {
    httpError(403, 'Нет доступа к составу курса')
  }

  const roster: Array<{ username: string, pseudonym: string }> = []
  const userStore = useUserStore()
  for (const username of course.students) {
    const u = await userStore.getUser(username)
    // аккаунт мог быть удалён — оставляем только живых участников
    if (u) roster.push({ username: u.username, pseudonym: u.pseudonym })
  }
  return { roster }
})
