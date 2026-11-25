import { requireUser, parseJson, groupBodySchema, courseSlugSchema } from '../../../../lib/validation'

/** Создать группу курса (courses.manage — проверяет адаптер). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const body = await parseJson(event, groupBodySchema)
  return useContentStore().createGroup(actor, slug, body)
})
