import { requireUser, courseSlugSchema, assignmentSlugSchema, usernameSchema, parseJson, gradeSubmissionBodySchema } from '../../../../../../lib/validation'
import { emitToUsernames } from '../../../../../../lib/events'

/** Учитель ставит оценку и возвращает работу ученику. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'id'))
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const body = await parseJson(event, gradeSubmissionBodySchema)
  const submission = await useContentStore().gradeSubmission(actor, slug, aid, username, body)

  // уведомление ученику: работа проверена (оценка/комментарий — в detail)
  const assignment = await useContentStore().getAssignment(actor, slug, aid)
  await emitToUsernames([username], {
    type: 'submission.graded',
    course: slug,
    title: assignment?.title ?? 'Задание',
    url: `/courses/${slug}/assignments/${aid}`,
    actor: actor.pseudonym,
    detail: submission.grade !== null ? `оценка: ${submission.grade}` : undefined,
    at: new Date().toISOString(),
  })

  return { submission }
})
