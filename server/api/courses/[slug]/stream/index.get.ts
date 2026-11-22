import { requireUser, courseSlugSchema } from '../../../../lib/validation'

/** Лента курса — участникам (canSee проверяет адаптер). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  return useContentStore().listStreamPosts(actor, slug)
})
