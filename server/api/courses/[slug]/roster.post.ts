import { requireUser, parseJson, rosterBodySchema, courseSlugSchema, usernameSchema } from '../../../lib/validation'
import { emitToCourse, emitToUsernames } from '../../../lib/events'

/**
 * Зачислить/исключить участника курса. Право (courses.roster.manage)
 * проверяет адаптер по области роли. Зачислять можно любой существующий
 * аккаунт — его возможности определяются его ролью (спека 08).
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const body = await parseJson(event, rosterBodySchema)

  if (body.action === 'add') {
    const target = await useUserStore().getUser(body.username)
    if (!target) httpError(404, `Пользователь «${body.username}» не найден`)
  }

  const store = useContentStore()
  const course = body.action === 'add'
    ? await store.addStudent(actor, slug, body.username)
    : await store.removeStudent(actor, slug, usernameSchema.parse(body.username))

  // новому ученику — личное уведомление о зачислении
  if (body.action === 'add') {
    await emitToUsernames([body.username], {
      type: 'roster.enrolled',
      course: slug,
      title: course.title,
      url: `/courses/${slug}`,
      actor: actor.pseudonym,
      at: new Date().toISOString(),
    })
  }

  // остальным — тихое событие для live-обновления списков
  await emitToCourse(actor, slug, {
    type: 'roster.changed',
    course: slug,
    title: course.title,
    url: `/courses/${slug}/students`,
    actor: actor.pseudonym,
    silent: true,
    at: new Date().toISOString(),
  })

  return { course }
})
