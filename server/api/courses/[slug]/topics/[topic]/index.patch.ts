import { requireUser, courseSlugSchema, materialSlugSchema, parseJson, updateMaterialBodySchema } from '../../../../../lib/validation'
import { httpError } from '../../../../../lib/errors'
import { emitToCourse } from '../../../../../lib/events'

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

  await emitToCourse(actor, slug, {
    type: 'material.updated',
    course: slug,
    title: material.title,
    url: `/courses/${slug}/topics/${material.slug}`,
    actor: actor.pseudonym,
    at: new Date().toISOString(),
  })

  return { material }
})
