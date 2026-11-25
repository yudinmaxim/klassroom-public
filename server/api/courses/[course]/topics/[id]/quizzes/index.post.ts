import { requireUser, courseSlugSchema, materialSlugSchema, quizBodySchema, parseJson } from '../../../../../../lib/validation'
import { emitToCourse } from '../../../../../../lib/events'

/** Создать проверку в теме (materials.edit). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'id'))
  const body = await parseJson(event, quizBodySchema)

  const quiz = await useContentStore().createQuiz(actor, slug, materialSlug, body)

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
