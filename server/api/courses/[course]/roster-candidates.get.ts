import { requireUser, courseSlugSchema } from '../../../lib/validation'
import { httpError } from '../../../lib/errors'
import { canOnCourse } from '../../../utils/can'

/**
 * Кандидаты на зачисление в курс: все аккаунты учеников платформы
 * (username + pseudonym — персональных данных нет по дизайну).
 * Доступно обладателям courses.roster.manage на этом курсе.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))

  const course = await useContentStore().getCourse(actor, slug)
  if (!course) httpError(404, 'Курс не найден')
  if (!(await canOnCourse(actor, 'courses.roster.manage', course))) {
    httpError(403, 'Недостаточно прав')
  }

  const users = await useUserStore().listUsers()
  return {
    students: users
      .filter(u => u.role === 'student')
      .map(u => ({ username: u.username, pseudonym: u.pseudonym })),
  }
})
