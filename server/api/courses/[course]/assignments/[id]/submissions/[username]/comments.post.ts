import { requireUser, parseJson, commentBodySchema, courseSlugSchema, assignmentSlugSchema, usernameSchema } from '../../../../../../../lib/validation'
import { emitToUsernames } from '../../../../../../../lib/events'

/**
 * Добавить комментарий в тред сдачи. После записи — уведомление второй
 * стороне: ученик → учителю курса, учитель → ученику.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'id'))
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const body = await parseJson(event, commentBodySchema)

  const comment = await useContentStore().addSubmissionComment(actor, slug, aid, username, body.text)

  try {
    const course = await useContentStore().getCourse(actor, slug)
    let title = aid
    try {
      title = (await useContentStore().getAssignment(actor, slug, aid))?.title ?? aid
    } catch { /* нет права view — берём slug */ }
    const url = `/courses/${slug}/assignments/${aid}`
    const payload = {
      type: 'comment.created' as const,
      course: slug,
      title,
      url,
      actor: actor.pseudonym,
      username,
      at: new Date().toISOString(),
    }
    // автор-ученик → учителю курса; автор-учитель → ученику
    const recipients = actor.username === username
      ? (course?.teacher ? [course.teacher] : [])
      : [username]
    if (recipients.length) emitToUsernames(recipients, payload)
  } catch {
    // уведомление не должно ломать уже записанный комментарий
  }

  return comment
})
