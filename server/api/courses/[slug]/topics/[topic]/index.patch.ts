import { requireUser, courseSlugSchema, materialSlugSchema, parseJson, updateMaterialBodySchema } from '../../../../../lib/validation'
import { httpError } from '../../../../../lib/errors'

/** Обновить название и/или содержимое материала (materials.edit). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'topic'))
  const body = await parseJson(event, updateMaterialBodySchema)

  if (body.title === undefined && body.content === undefined) {
    httpError(400, 'Нечего обновлять: передайте title и/или content')
  }

  const material = await useContentStore().updateMaterial(actor, slug, materialSlug, body)
  return { material }
})
