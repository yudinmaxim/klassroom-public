import { requireUser, courseSlugSchema, parseJson, createMaterialBodySchema } from '../../../../lib/validation'
import { emitToCourse } from '../../../../lib/events'

/**
 * Создать материал (пермишен materials.create, владелец курса или admin
 * — проверяет адаптер). Контент по умолчанию пустой; тип из реестра плагинов.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const body = await parseJson(event, createMaterialBodySchema)

  const material = await useContentStore().createMaterial(actor, slug, body)

  await emitToCourse(actor, slug, {
    type: 'material.created',
    course: slug,
    title: material.title,
    url: `/courses/${slug}/topics/${material.slug}`,
    actor: actor.pseudonym,
    at: new Date().toISOString(),
  })

  return { material }
})
