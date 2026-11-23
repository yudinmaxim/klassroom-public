import { requireUser, courseSlugSchema } from '../../../../lib/validation'

/** Группы курса — участникам (для селекторов/фильтров). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  return useContentStore().listGroups(actor, slug)
})
