import { requireUser, courseSlugSchema, materialSlugSchema, quizIdParamSchema } from '../../../../../../../lib/validation'
import { emitToCourse } from '../../../../../../../lib/events'

/** Удалить проверку вместе с ответами (materials.edit). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'id'))
  const quizId = quizIdParamSchema.parse(getRouterParam(event, 'quiz'))

  await useContentStore().deleteQuiz(actor, slug, materialSlug, quizId)

  await emitToCourse(actor, slug, {
    type: 'material.updated',
    course: slug,
    url: `/courses/${slug}/topics/${materialSlug}`,
    actor: actor.pseudonym,
    at: new Date().toISOString(),
  })

  return { ok: true }
})
