import { requireUser, courseSlugSchema, materialSlugSchema, quizIdParamSchema } from '../../../../../../../../lib/validation'

/** Попытки: учителю — все ученики, ученику — только свои. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'id'))
  const quizId = quizIdParamSchema.parse(getRouterParam(event, 'quiz'))

  const attempts = await useContentStore().listQuizAttempts(actor, slug, materialSlug, quizId)
  return { attempts }
})
