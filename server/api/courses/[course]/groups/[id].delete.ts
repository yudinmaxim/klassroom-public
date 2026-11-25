import { requireUser, courseSlugSchema } from '../../../../lib/validation'

/** Удалить группу: контент отвязывается и становится «безгрупповым». */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const gid = getRouterParam(event, 'id')
  if (!gid) throw createError({ statusCode: 400, message: 'groupId обязателен' })
  await useContentStore().deleteGroup(actor, slug, gid)
  return { ok: true }
})
