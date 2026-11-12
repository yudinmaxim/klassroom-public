import type { Course, CourseSummary, GradingScale, UserPublic } from '#shared/types'

/**
 * Порт хранилища учебного контента (specs/01-architecture.md) — первый срез:
 * курсы, состав (roster), шкала оценивания. Права доступа — часть домена
 * (адаптер проверяет их по actor), поэтому роуты не дублируют проверки.
 *
 * Методы формулируются в терминах домена: «учитель создал курс», «учитель
 * зачислил ученика». Актор передаётся явно — он же автор записи в git-журнале.
 */
export interface ContentStore {
  /** Курсы, доступные actor: админ — все, учитель — свои, ученик — зачисленные. */
  listCourses(actor: UserPublic): Promise<CourseSummary[]>

  /** Курс целиком или null, если он не существует или недоступен actor. */
  getCourse(actor: UserPublic, slug: string): Promise<Course | null>

  /** Создать курс (только admin/teacher). */
  createCourse(
    actor: UserPublic,
    input: { title: string, description?: string, slug?: string, gradingScale?: GradingScale },
  ): Promise<Course>

  /** Обновить настройки курса (владелец или admin). */
  updateCourse(
    actor: UserPublic,
    slug: string,
    patch: { title?: string, description?: string, gradingScale?: GradingScale },
  ): Promise<Course>

  /** Зачислить ученика (владелец или admin). */
  addStudent(actor: UserPublic, slug: string, username: string): Promise<Course>

  /** Исключить ученика (владелец или admin). */
  removeStudent(actor: UserPublic, slug: string, username: string): Promise<Course>
}
