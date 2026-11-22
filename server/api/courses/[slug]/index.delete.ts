import { requireUser, courseSlugSchema } from '../../../lib/validation'

/** Удалить курс целиком. Право (courses.manage по области) проверяет адаптер. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  await useContentStore().deleteCourse(actor, slug)
  return { ok: true }
})
