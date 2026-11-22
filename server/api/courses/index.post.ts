import { parseJson, createCourseBodySchema } from '../../lib/validation'
import { requirePermission } from '../../utils/can'

/** Создать курс (пермишен courses.create). */
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, 'courses.create')
  const body = await parseJson(event, createCourseBodySchema)
  const course = await useContentStore().createCourse(actor, body)
  return { course }
})
