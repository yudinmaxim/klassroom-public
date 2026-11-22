import { requireUser, parseJson, updateCourseBodySchema, courseSlugSchema } from '../../../lib/validation'

/** Обновить настройки курса. Право (courses.manage) проверяет адаптер по области роли. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const body = await parseJson(event, updateCourseBodySchema)
  const course = await useContentStore().updateCourse(actor, slug, body)
  return { course }
})
