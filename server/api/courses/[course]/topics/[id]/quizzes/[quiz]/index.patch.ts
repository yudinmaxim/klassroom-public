import { requireUser, courseSlugSchema, materialSlugSchema, quizIdParamSchema, updateQuizBodySchema, parseJson } from '../../../../../../../lib/validation'
import { emitToCourse } from '../../../../../../../lib/events'

/** Обновить проверку (название, showAnswers, вопросы). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'id'))
  const quizId = quizIdParamSchema.parse(getRouterParam(event, 'quiz'))
  const body = await parseJson(event, updateQuizBodySchema)

  const quiz = await useContentStore().updateQuiz(actor, slug, materialSlug, quizId, body)

  await emitToCourse(actor, slug, {
    type: 'material.updated',
    course: slug,
    title: quiz.title,
    url: `/courses/${slug}/topics/${materialSlug}`,
    actor: actor.pseudonym,
    at: new Date().toISOString(),
  })

  return { quiz }
})
