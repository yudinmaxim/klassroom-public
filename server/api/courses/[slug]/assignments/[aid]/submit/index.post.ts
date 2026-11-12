import { requireUser, courseSlugSchema, assignmentSlugSchema, parseJson, submitAssignmentBodySchema } from '../../../../../../lib/validation'

/** Ученик сдаёт/пересдаёт работу по выданному заданию. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  const body = await parseJson(event, submitAssignmentBodySchema)
  const submission = await useContentStore().submitAssignment(actor, slug, aid, body.answer)
  return { submission }
})
