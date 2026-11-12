import { requireRole, parseJson, updateCourseBodySchema, courseSlugSchema } from '../../../lib/validation'

/** Обновить настройки курса (владелец или admin). */
export default defineEventHandler(async (event) => {
  const actor = await requireRole(event, 'admin', 'teacher')
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const body = await parseJson(event, updateCourseBodySchema)
  const course = await useContentStore().updateCourse(actor, slug, body)
  return { course }
})
