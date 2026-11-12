import { requireUser, courseSlugSchema } from '../../../lib/validation'
import { httpError } from '../../../lib/errors'
import { canOnCourse } from '../../../utils/can'

/**
 * Детали курса. roster отдаётся при пермишене courses.roster.view,
 * флаг canManage — при courses.manage (обе проверки — с учётом области роли).
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))

  const course = await useContentStore().getCourse(actor, slug)
  if (!course) httpError(404, 'Курс не найден')

  const canViewRoster = await canOnCourse(actor, 'courses.roster.view', course)
  const canManage = await canOnCourse(actor, 'courses.manage', course)
  const canMaterials = await canOnCourse(actor, 'materials.edit', course)
  const canAssignments = await canOnCourse(actor, 'assignments.create', course)

  const roster: Array<{ username: string, pseudonym: string }> = []
  if (canViewRoster) {
    const userStore = useUserStore()
    for (const username of course.students) {
      const u = await userStore.getUser(username)
      // аккаунт мог быть удалён — оставляем только живых участников
      if (u) roster.push({ username: u.username, pseudonym: u.pseudonym })
    }
  }

  return { course, roster, canManage, canMaterials, canAssignments }
})
