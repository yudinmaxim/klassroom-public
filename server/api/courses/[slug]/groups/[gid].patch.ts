import { requireUser, parseJson, updateGroupBodySchema, courseSlugSchema } from '../../../../../lib/validation'

/** Переименовать группу и/или заменить состав. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const gid = getRouterParam(event, 'gid')
  if (!gid) throw createError({ statusCode: 400, message: 'groupId обязателен' })
  const body = await parseJson(event, updateGroupBodySchema)
  return useContentStore().updateGroup(actor, slug, gid, body)
})
