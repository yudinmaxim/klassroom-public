import { requireUser, courseSlugSchema } from '../../../lib/validation'

/** Журнал оценок курса: учителю — все ученики, ученику — только своя строка. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  return useContentStore().getGradebook(actor, slug)
})
