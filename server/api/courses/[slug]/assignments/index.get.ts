import { requireUser, courseSlugSchema } from '../../../../lib/validation'

/** Список заданий курса (assignments.view, область роли — проверяет адаптер). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  return { assignments: await useContentStore().listAssignments(actor, slug) }
})
