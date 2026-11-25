import { requireUser, courseSlugSchema } from '../../../../../lib/validation'

/** Тред комментариев поста ленты курса — участникам курса. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const pid = getRouterParam(event, 'id')
  if (!pid) throw createError({ statusCode: 400, message: 'postId обязателен' })
  return useContentStore().listStreamComments(actor, slug, pid)
})
