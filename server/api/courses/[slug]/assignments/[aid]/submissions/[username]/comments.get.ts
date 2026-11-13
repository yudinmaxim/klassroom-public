import { requireUser, courseSlugSchema, assignmentSlugSchema, usernameSchema } from '../../../../../../../lib/validation'

/** Тред комментариев сдачи (specs/10): ученику — своя, проверяющему — любая. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  return useContentStore().listSubmissionComments(actor, slug, aid, username)
})
