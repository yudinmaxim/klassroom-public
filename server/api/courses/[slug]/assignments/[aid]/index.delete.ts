import { requireUser, courseSlugSchema, assignmentSlugSchema } from '../../../../../lib/validation'

/** Удалить задание со всеми сдачами. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  await useContentStore().deleteAssignment(actor, slug, aid)
  return { ok: true }
})
