import { requireUser, courseSlugSchema, materialSlugSchema } from '../../../../../lib/validation'
import { httpError } from '../../../../../lib/errors'

/** Материал целиком: payload плагина + санитизированный html + оглавление. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'material'))

  const material = await useContentStore().getMaterial(actor, slug, materialSlug)
  if (!material) httpError(404, 'Материал не найден')
  return { material }
})
