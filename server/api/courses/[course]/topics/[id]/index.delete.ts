import { requireUser, courseSlugSchema, materialSlugSchema } from '../../../../../lib/validation'

/** Удалить материал вместе с содержимым (materials.edit). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'id'))

  await useContentStore().deleteMaterial(actor, slug, materialSlug)
  return { ok: true }
})
