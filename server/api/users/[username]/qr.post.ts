import { z } from 'zod'
import { networkInterfaces } from 'node:os'
import type { H3Event } from 'h3'
import { requireUser, parseJson, usernameSchema } from '../../../lib/validation'
import { can } from '../../../utils/can'
import { httpError } from '../../../lib/errors'

/** TTL-режимы из спеки 09: «раздать в классе» и «на дом». */
const TTL_CHOICES = { class: 15, home: 7 * 24 * 60 }

const bodySchema = z.object({
  ttl: z.enum(['class', 'home']).default('class'),
})

/**
 * Адреса, по которым QR-ссылку сможет открыть телефон ученика.
 * Если админ сидит на localhost — origin бесполезен для телефона,
 * поэтому отдаём внешние IPv4 интерфейсы с тем же портом.
 * Иначе — просто origin запроса.
 */
function reachableBases(event: H3Event): string[] {
  const host = getRequestHost(event)
  const proto = getRequestProtocol(event)
  const isLocal = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)$/.test(host.split(':')[0] ?? '')
  if (!isLocal) return [`${proto}://${host}`]

  const portPart = host.includes(':') ? `:${host.split(':').pop()}` : ''
  const bases = new Set<string>([`http://localhost${portPart}`])
  for (const infos of Object.values(networkInterfaces())) {
    for (const i of infos ?? []) {
      if (i.family === 'IPv4' && !i.internal) bases.add(`http://${i.address}${portPart}`)
    }
  }
  return [...bases]
}

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
  return { token: token.token, expiresAt: token.expiresAt, bases: reachableBases(event) }
})
