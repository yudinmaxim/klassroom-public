import { requireRole, parseJson, createCourseBodySchema } from '../../lib/validation'

/** Создать курс (admin/teacher). */
export default defineEventHandler(async (event) => {
  const actor = await requireRole(event, 'admin', 'teacher')
  const body = await parseJson(event, createCourseBodySchema)
  const course = await useContentStore().createCourse(actor, body)
  return { course }
})
