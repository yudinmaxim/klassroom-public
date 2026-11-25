import { requireUser, courseSlugSchema, assignmentSlugSchema, usernameSchema } from '../../../../../../lib/validation'

/** Деталь сдачи ученика + история версий — учителю. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'id'))
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  return await useContentStore().getSubmissionDetail(actor, slug, aid, username)
})
