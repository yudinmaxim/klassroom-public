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

// --- Материалы (шаг 3, specs/04-plugins.md) ---

/** Пункт оглавления материала. */
export interface TocItem {
  /** anchor id (совпадает с id заголовка в html). */
  id: string
  text: string
  /** 2 = «##», 3 = «###». */
  level: number
}

/** Материал в списке курса. */
export interface MaterialSummary {
  slug: string
  title: string
  type: string
  updatedAt: string
}

/**
 * Материал целиком. `payload` — данные плагина типа (для doc:
 * DocPayload). `html`/`toc` — отрендеренный и санитизированный контент.
 */
export interface Material {
  slug: string
  title: string
  type: string
  createdAt: string
  updatedAt: string
  payload: unknown
  html: string
  toc: TocItem[]
}

/** Payload плагина doc: markdown + список вложений. */
export interface DocPayload {
  content: string
  attachments: string[]
}
