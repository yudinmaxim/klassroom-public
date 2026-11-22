import type { H3Event } from 'h3'
import type { UserPublic } from '#shared/types'
import { requireUser } from '../lib/validation'
import { httpError } from '../lib/errors'
import { canByRole } from '../lib/permissions'
import { useRoleStore } from './role-store'

/**
 * Уровень 2 проверки прав (specs/08-roles-permissions.md): обёртки с IO.
 * requirePermission — для платформенных кодов; canOnCourse — для курсовых,
 * где область определяется владением (owner) или зачислением (member).
 */

/** Проверка платформенного (контекст-свободного) пермишена. */
export async function can(actor: UserPublic, code: string): Promise<boolean> {
  const def = await useRoleStore().getRole(actor.role)
  if (!def) return false
  return canByRole(def, code)
}

/** Проверка курсового пермишена с учётом области роли. */
export async function canOnCourse(
  actor: UserPublic,
  code: string,
  course: { teacher: string, students: string[] },
): Promise<boolean> {
  if (actor.role === 'admin') return true
  const def = await useRoleStore().getRole(actor.role)
  if (!def) return false
  if (!def.permissions.includes(code)) return false
  if (def.scope === 'owner') return course.teacher === actor.username
  if (def.scope === 'member') return course.students.includes(actor.username)
  return false
}

/** Требовать платформенный пермишен, иначе 403. */
export async function requirePermission(event: H3Event, code: string): Promise<UserPublic> {
  const user = await requireUser(event)
  if (!(await can(user, code))) httpError(403, 'Недостаточно прав')
  return user
}
