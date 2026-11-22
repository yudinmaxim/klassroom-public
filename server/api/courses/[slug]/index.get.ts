import { requireUser, courseSlugSchema } from '../../../lib/validation'
import { httpError } from '../../../lib/errors'
import { canOnCourse } from '../../../utils/can'

/**
 * Детали курса: только course + права. Состав (roster) — отдельным
 * запросом GET …/roster, списки тем/заданий — на своих вкладках.
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

  return { course, canManage, canMaterials, canAssignments, canViewRoster }
})
