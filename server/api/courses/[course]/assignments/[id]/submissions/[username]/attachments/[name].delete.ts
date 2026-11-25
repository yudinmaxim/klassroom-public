import { requireUser, courseSlugSchema, assignmentSlugSchema, usernameSchema, attachmentNameSchema } from '../../../../../../../../lib/validation'

/** Удалить вложение сдачи (владелец или проверяющий). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'id'))
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const name = attachmentNameSchema.parse(decodeURIComponent(getRouterParam(event, 'name') ?? ''))

  await useContentStore().removeSubmissionAttachment(actor, slug, aid, username, name)
  return { ok: true }
})
