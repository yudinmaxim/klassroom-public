import { requireUser, courseSlugSchema, assignmentSlugSchema } from '../../../../../../lib/validation'

/** Своя сдача ученика по заданию. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  const submission = await useContentStore().getOwnSubmission(actor, slug, aid)
  return { submission }
})
