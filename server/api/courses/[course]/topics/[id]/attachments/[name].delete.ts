import { requireUser, courseSlugSchema, materialSlugSchema, attachmentNameSchema } from '../../../../../../lib/validation'

/** Удалить вложение (materials.edit). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'id'))
  const name = attachmentNameSchema.parse(decodeURIComponent(getRouterParam(event, 'name') ?? ''))

  await useContentStore().removeAttachment(actor, slug, materialSlug, name)
  return { ok: true }
})
