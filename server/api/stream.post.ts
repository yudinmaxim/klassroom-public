import { requireUser, parseJson, commentBodySchema, courseSlugSchema, groupsFieldSchema } from '../lib/validation'
import { emitToCourse } from '../lib/events'

const streamPostSchema = commentBodySchema.extend({
  course: courseSlugSchema,
  groups: groupsFieldSchema,
})

/** Новый пост в ленте конкретного курса (из глобальной страницы /stream). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const body = await parseJson(event, streamPostSchema)

  const post = await useContentStore().addStreamPost(actor, body.course, body.text, body.groups)

  const course = await useContentStore().getCourse(actor, body.course)
  emitToCourse(actor, body.course, {
    type: 'stream.posted',
    course: body.course,
    title: course?.title ?? body.course,
    url: `/stream`,
    actor: actor.pseudonym,
    at: new Date().toISOString(),
  })

  return post
})
