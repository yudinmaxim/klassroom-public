import type { RoleDef } from '#shared/types'
import { PERMISSION_CODES, type PermissionCode } from '#shared/permissions-catalog'

/**
 * Уровень 1 проверки прав (specs/08-roles-permissions.md): «способность» —
 * чистая карта роль → пермишены, без IO. Контекстная область (владение/
 * зачисление) — уровень 2, применяется там, где есть данные ресурса
 * (например, в адаптере ContentStore через RoleStore).
 *
 * Deny by default: всё, что не выдано, запрещено.
 */

/** Пермишены, которым нужен ресурсный контекст (курс). */
const RESOURCE_SCOPED: string[] = [
  'courses.view', 'courses.manage', 'courses.roster.view', 'courses.roster.manage', 'courses.archive',
  'materials.create', 'materials.edit', 'materials.view',
  'assignments.create', 'assignments.view',
  'submissions.create', 'submissions.view.all', 'submissions.view.own', 'submissions.grade', 'submissions.resubmit',
  'schedule.manage', 'schedule.view', 'calendar.view',
]

export function isResourceScoped(code: string): boolean {
  return RESOURCE_SCOPED.includes(code)
}

/** Системные значения по умолчанию (спека 08). Правятся админом через roles/*.yml. */
export const BUILTIN_ROLE_DEFAULTS: Record<string, Omit<RoleDef, 'builtin'>> = {
  admin: {
    name: 'admin',
    title: 'Администратор платформы',
    scope: 'none',
    permissions: [...PERMISSION_CODES],
  },
  teacher: {
    name: 'teacher',
    title: 'Учитель',
    scope: 'owner',
    permissions: [
      'users.create.student',
      'users.qr.generate',
      'courses.create', 'courses.view', 'courses.manage',
      'courses.roster.view', 'courses.roster.manage',
      'materials.create', 'materials.edit', 'materials.view',
      'assignments.create', 'assignments.view',
      'submissions.view.all', 'submissions.view.own', 'submissions.grade',
      'schedule.manage', 'schedule.view', 'calendar.view',
    ],
  },
  student: {
    name: 'student',
    title: 'Ученик',
    scope: 'member',
    permissions: [
      'courses.view', 'courses.roster.view',
      'materials.view', 'assignments.view',
      'submissions.create', 'submissions.view.own', 'submissions.resubmit',
      'schedule.view', 'calendar.view',
    ],
  },
}

export function builtinDefaultsFor(role: string): RoleDef | null {
  const base = BUILTIN_ROLE_DEFAULTS[role]
  return base ? { ...base, permissions: [...base.permissions], builtin: true } : null
}

/**
 * Проверка «способности» без контекста ресурса.
 * Для ресурсных пермишенов возвращает true только если роль допускает
 * пермишен в принципе; финальное решение принимает уровень 2.
 */
export function canByRole(roleDef: RoleDef, code: string, isResourceContext = false): boolean {
  if (roleDef.name === 'admin') return true
  if (!roleDef.permissions.includes(code)) return false
  if (isResourceScoped(code) && isResourceContext && roleDef.scope === 'none') return false
  return true
}

/** Привести список кодов к допустимым (отфильтровать неизвестные). */
export function filterKnownPermissions(codes: unknown): PermissionCode[] {
  if (!Array.isArray(codes)) return []
  return codes.filter((c): c is PermissionCode =>
    typeof c === 'string' && PERMISSION_CODES.includes(c as PermissionCode),
  )
}
