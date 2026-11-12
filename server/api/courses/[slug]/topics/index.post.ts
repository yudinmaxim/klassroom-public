import { requireUser, courseSlugSchema, parseJson, createMaterialBodySchema } from '../../../../lib/validation'

/**
 * Создать материал (пермишен materials.create, владелец курса или admin
 * — проверяет адаптер). Контент по умолчанию пустой; тип из реестра плагинов.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const body = await parseJson(event, createMaterialBodySchema)

  const material = await useContentStore().createMaterial(actor, slug, body)
  return { material }
})
