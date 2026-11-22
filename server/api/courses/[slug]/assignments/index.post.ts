import { requireUser, courseSlugSchema, parseJson, createAssignmentBodySchema } from '../../../../lib/validation'

/** Создать задание (assignments.create — владелец курса или admin). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const body = await parseJson(event, createAssignmentBodySchema)
  const assignment = await useContentStore().createAssignment(actor, slug, body)
  return { assignment }
})
