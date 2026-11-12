import { requireUser, courseSlugSchema, assignmentSlugSchema, parseJson, updateAssignmentBodySchema } from '../../../../../lib/validation'

/** Обновить задание: поля, описание, статус draft↔published. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  const body = await parseJson(event, updateAssignmentBodySchema)
  const assignment = await useContentStore().updateAssignment(actor, slug, aid, body)
  return { assignment }
})
