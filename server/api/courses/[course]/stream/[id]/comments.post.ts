import { requireUser, parseJson, commentBodySchema, courseSlugSchema } from '../../../../../lib/validation'
import { emitToCourse } from '../../../../../lib/events'

/**
 * Новый комментарий к посту ленты курса. После записи — уведомление всем
 * участникам курса.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const pid = getRouterParam(event, 'id')
  if (!pid) throw createError({ statusCode: 400, message: 'postId обязателен' })
  const body = await parseJson(event, commentBodySchema)

  const comment = await useContentStore().addStreamComment(actor, slug, pid, body.text)

  const course = await useContentStore().getCourse(actor, slug)
  emitToCourse(actor, slug, {
    type: 'stream.comment.created',
    course: slug,
    title: course?.title ?? slug,
    url: `/courses/${slug}/stream?p=${pid}`,
    actor: actor.pseudonym,
    at: new Date().toISOString(),
  })

  return comment
})
