import { requireUser, courseSlugSchema, materialSlugSchema, quizIdParamSchema, quizAnswersBodySchema, parseJson } from '../../../../../../../../lib/validation'

/** Сдать попытку: сервер авто-оценивает и сохраняет в answers/<username>.yml. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'id'))
  const quizId = quizIdParamSchema.parse(getRouterParam(event, 'quiz'))
  const body = await parseJson(event, quizAnswersBodySchema)

  return useContentStore().submitQuizAttempt(actor, slug, materialSlug, quizId, body.answers)
})
