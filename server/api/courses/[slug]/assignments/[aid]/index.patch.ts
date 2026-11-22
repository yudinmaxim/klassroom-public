import { requireUser, courseSlugSchema, assignmentSlugSchema, parseJson, updateAssignmentBodySchema } from '../../../../../lib/validation'
import { emitToCourse } from '../../../../../lib/events'

/** Обновить задание: поля, описание, статус draft↔published. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  const body = await parseJson(event, updateAssignmentBodySchema)
  const assignment = await useContentStore().updateAssignment(actor, slug, aid, body)

  // выдача/отзыв — уведомляем участников (для частного — только audience)
  if (body.status === 'published' || body.status === 'draft') {
    const published = body.status === 'published'
    await emitToCourse(actor, slug, {
      type: published ? 'assignment.published' : 'assignment.unpublished',
      course: slug,
      title: assignment.title,
      url: `/courses/${slug}/assignments/${assignment.slug}`,
      actor: actor.pseudonym,
      at: new Date().toISOString(),
    }, assignment.type === 'private' ? assignment.audience : undefined)
  }

  return { assignment }
})
