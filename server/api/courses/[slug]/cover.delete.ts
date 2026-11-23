import { requireUser, courseSlugSchema } from '../../../lib/validation'

/** Убрать обложку курса (courses.manage). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))

  await useContentStore().removeCourseCover(actor, slug)
  return { ok: true }
})
