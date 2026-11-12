import type { Course, CourseSummary, GradingScale, Material, MaterialSummary, UserPublic } from '#shared/types'

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

  // --- Материалы (шаг 3, specs/04-plugins.md) ---

  /** Материалы курса (пермишен materials.view, область роли). */
  listMaterials(actor: UserPublic, courseSlug: string): Promise<MaterialSummary[]>

  /** Материал целиком: payload плагина + санитизированный html + оглавление. */
  getMaterial(actor: UserPublic, courseSlug: string, materialSlug: string): Promise<Material | null>

  /** Создать материал (materials.create, владелец курса или admin). */
  createMaterial(
    actor: UserPublic,
    courseSlug: string,
    input: { title: string, type: string, content: string },
  ): Promise<MaterialSummary>

  /** Обновить название и/или содержимое материала (materials.edit). */
  updateMaterial(
    actor: UserPublic,
    courseSlug: string,
    materialSlug: string,
    patch: { title?: string, content?: string },
  ): Promise<Material>

  /** Удалить материал вместе с содержимым (materials.edit). */
  deleteMaterial(actor: UserPublic, courseSlug: string, materialSlug: string): Promise<void>

  /** Приложить файл к материалу (materials.edit). Возвращает имя файла. */
  addAttachment(
    actor: UserPublic,
    courseSlug: string,
    materialSlug: string,
    file: { name: string, data: Buffer },
  ): Promise<string>

  /** Удалить вложение (materials.edit). */
  removeAttachment(
    actor: UserPublic,
    courseSlug: string,
    materialSlug: string,
    name: string,
  ): Promise<void>

  /** Выдать вложение (materials.view): данные + mime. */
  getAttachment(
    actor: UserPublic,
    courseSlug: string,
    materialSlug: string,
    name: string,
  ): Promise<{ data: Buffer, mime: string } | null>
}
