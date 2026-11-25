import { requireUser, courseSlugSchema, assignmentSlugSchema, usernameSchema, parseJson, resubmitOverrideBodySchema } from '../../../../../../../lib/validation'

/** Переопределить правило пересдачи для конкретного ученика (allowed: null — к общему). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'id'))
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const body = await parseJson(event, resubmitOverrideBodySchema)
  const assignment = await useContentStore().setResubmitOverride(actor, slug, aid, username, body.allowed)
  return { assignment }
})
