import { requireUser, courseSlugSchema, assignmentSlugSchema, parseJson, submitAssignmentBodySchema } from '../../../../../../lib/validation'
import { emitToUsernames } from '../../../../../../lib/events'

/** Ученик сдаёт/пересдаёт работу по выданному заданию. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  const body = await parseJson(event, submitAssignmentBodySchema)
  const submission = await useContentStore().submitAssignment(actor, slug, aid, body.answer)

  // уведомляем только учителя курса — автору своё действие не нужно
  const course = await useContentStore().getCourse(actor, slug)
  const assignment = course
    ? await useContentStore().getAssignment(actor, slug, aid)
    : null
  if (course) {
    await emitToUsernames([course.teacher], {
      type: 'submission.created',
      course: slug,
      title: assignment?.title ?? 'Задание',
      url: `/courses/${slug}/assignments/${aid}`,
      actor: actor.pseudonym,
      at: new Date().toISOString(),
    })
  }

  return { submission }
})
