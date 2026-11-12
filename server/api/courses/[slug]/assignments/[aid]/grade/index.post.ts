import { requireUser, courseSlugSchema, assignmentSlugSchema, usernameSchema, parseJson, gradeSubmissionBodySchema } from '../../../../../../lib/validation'

/** Учитель ставит оценку и возвращает работу ученику. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const body = await parseJson(event, gradeSubmissionBodySchema)
  const submission = await useContentStore().gradeSubmission(actor, slug, aid, username, body)
  return { submission }
})
