import { requireUser, parseJson, streamPostBodySchema, courseSlugSchema } from '../../../../lib/validation'
import { emitToCourse } from '../../../../lib/events'

/**
 * Новый пост в ленте курса. После записи — уведомление всем
 * участникам курса (без эха автору на других устройствах — emitToCourse
 * добавляет автора в цели, это желаемо: мультидевайс).
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const body = await parseJson(event, streamPostBodySchema)

  const post = await useContentStore().addStreamPost(actor, slug, body.text, body.groups)

  const course = await useContentStore().getCourse(actor, slug)
  emitToCourse(actor, slug, {
    type: 'stream.posted',
    course: slug,
    title: course?.title ?? slug,
    url: `/courses/${slug}/stream`,
    actor: actor.pseudonym,
    at: new Date().toISOString(),
  })

  return post
})
