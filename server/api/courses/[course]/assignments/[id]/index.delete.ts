import { requireUser, courseSlugSchema, assignmentSlugSchema } from '../../../../../lib/validation'

/** Удалить задание со всеми сдачами. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'id'))
  await useContentStore().deleteAssignment(actor, slug, aid)
  return { ok: true }
})
