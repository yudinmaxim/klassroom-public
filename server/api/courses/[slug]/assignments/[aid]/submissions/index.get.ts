import { requireUser, courseSlugSchema, assignmentSlugSchema } from '../../../../../../lib/validation'

/** Сдачи по заданию — учителю (submissions.view.all/grade). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  return { submissions: await useContentStore().listSubmissions(actor, slug, aid) }
})
