import { requireUser, courseSlugSchema } from '../../../../lib/validation'
import { httpError } from '../../../../lib/errors'

/** Список материалов курса (пермишен materials.view проверяет адаптер). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))

  if (!await useContentStore().getCourse(actor, slug)) httpError(404, 'Курс не найден')
  return { materials: await useContentStore().listMaterials(actor, slug) }
})
