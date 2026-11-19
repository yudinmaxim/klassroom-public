import { z } from 'zod'
import { requireUser, parseJson, usernameSchema } from '../../../lib/validation'
import { can } from '../../../utils/can'
import { httpError } from '../../../lib/errors'

/** TTL-режимы из спеки 09: «раздать в классе» и «на дом». */
const TTL_CHOICES = { class: 15, home: 7 * 24 * 60 }

const bodySchema = z.object({
  ttl: z.enum(['class', 'home']).default('class'),
})

/**
 * Выдать QR-токен входа пользователю (пермишен users.qr.generate).
 * Админ — для любого аккаунта; остальные — только для участников
 * курсов в пределах своей области (владелец — своим ученикам).
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const { ttl } = await parseJson(event, bodySchema)

  if (!(await can(actor, 'users.qr.generate'))) httpError(403, 'Недостаточно прав')

  const target = await useUserStore().getUser(username)
  if (!target) httpError(404, `Пользователь «${username}» не найден`)

  if (actor.role !== 'admin') {
    const courses = await useContentStore().listCourses(actor)
    let inRoster = false
    for (const c of courses) {
      const full = await useContentStore().getCourse(actor, c.slug)
      if (full?.students.includes(username)) {
        inRoster = true
        break
      }
    }
    if (!inRoster) httpError(403, 'Пользователь не состоит в доступных вам курсах')
  }

  const token = await useQrTokens().issue(username, TTL_CHOICES[ttl])
  return { token: token.token, expiresAt: token.expiresAt }
})
