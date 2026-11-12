// Общие типы (используются сервером и фронтом)

/**
 * Роль = именованный набор пермишенов (specs/08-roles-permissions.md).
 * Базовые роли системные, но их наборы прав редактирует админ; собственные
 * роли создаются администратором платформы.
 */
export type Role = 'admin' | 'teacher' | 'student' | (string & {})

export interface UserPublic {
  username: string
  pseudonym: string
  role: Role
  createdAt: string
}

/**
 * Область действия ресурсных пермишенов роли:
 *  - owner  — «свои» объекты (как учитель: course.teacher === username)
 *  - member — зачисленные объекты (как ученик: username в roster)
 *  - none   — только платформенные (контекстные пермишены недоступны)
 */
export type RoleScope = 'none' | 'owner' | 'member'

export interface RoleDef {
  /** Код роли (slug), он же значение user.role. */
  name: Role
  /** Человекочитаемое название. */
  title: string
  scope: RoleScope
  /** Коды пермишенов из каталога (shared/permissions-catalog.ts). */
  permissions: string[]
  /** Системная роль: набор прав правится, но саму роль удалить нельзя. */
  builtin: boolean
}

/** Шкала оценивания курса (настраивается учителем, specs/05). */
export type GradingScale =
  | { type: 'grade5' }
  | { type: 'points', max: number }
  | { type: 'passfail' }

/** Курс = «класс + предмет» одним понятием (specs/02). Один курс = один учитель (MVP). */
export interface Course {
  slug: string
  title: string
  description: string
  teacher: string
  gradingScale: GradingScale
  createdAt: string
  /** username'ы зачисленных учеников */
  students: string[]
}

/** Краткое представление для списков. */
export interface CourseSummary {
  slug: string
  title: string
  teacher: string
  studentCount: number
}
