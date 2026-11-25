import { requireUser, courseSlugSchema, materialSlugSchema, quizIdParamSchema } from '../../../../../../../lib/validation'
import { httpError } from '../../../../../../../lib/errors'

/** Проверка целиком; ученику — срезанная версия без правильных ответов. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'id'))
  const quizId = quizIdParamSchema.parse(getRouterParam(event, 'quiz'))

  const quiz = await useContentStore().getQuiz(actor, slug, materialSlug, quizId)
  if (!quiz) httpError(404, 'Проверка не найдена')
  return { quiz }
})
