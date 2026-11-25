import { requireUser, courseSlugSchema, assignmentSlugSchema } from '../../../../../lib/validation'
import { httpError } from '../../../../../lib/errors'

/** Задание целиком с отрендеренным описанием. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'id'))
  const assignment = await useContentStore().getAssignment(actor, slug, aid)
  if (!assignment) httpError(404, 'Задание не найдено')
  return { assignment }
})
