import type { Assignment, AssignmentSummary, Course, CourseSummary, GradingScale, Material, MaterialSummary, Submission, SubmissionVersion, UserPublic } from '#shared/types'

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

  // --- Домашние задания (шаг 4) ---

  /** Задания курса: учитель видит все, ученик — только выданные ему. */
  listAssignments(actor: UserPublic, courseSlug: string): Promise<AssignmentSummary[]>

  /** Задание целиком (учитель — любое, ученик — выданное ему). */
  getAssignment(actor: UserPublic, courseSlug: string, assignmentSlug: string): Promise<Assignment | null>

  /** Создать задание (assignments.create, владелец курса или admin). */
  createAssignment(
    actor: UserPublic,
    courseSlug: string,
    input: {
      title: string
      type: 'general' | 'private'
      audience?: string[]
      due?: string | null
      maxPoints?: number | null
      description?: string
    },
  ): Promise<AssignmentSummary>

  /** Обновить задание: поля, описание и/или статус draft↔published. */
  updateAssignment(
    actor: UserPublic,
    courseSlug: string,
    assignmentSlug: string,
    patch: {
      title?: string
      type?: 'general' | 'private'
      audience?: string[]
      due?: string | null
      maxPoints?: number | null
      description?: string
      status?: 'draft' | 'published'
    },
  ): Promise<Assignment>

  /** Удалить задание вместе со сдачами. */
  deleteAssignment(actor: UserPublic, courseSlug: string, assignmentSlug: string): Promise<void>

  /** Ученик сдаёт/пересдаёт работу (только по выданному заданию). */
  submitAssignment(
    actor: UserPublic,
    courseSlug: string,
    assignmentSlug: string,
    answer: string,
  ): Promise<Submission>

  /** Своя сдача ученика по заданию (или null). */
  getOwnSubmission(actor: UserPublic, courseSlug: string, assignmentSlug: string): Promise<Submission | null>

  /** Сдачи по заданию — только учителю (submissions.view.all). */
  listSubmissions(actor: UserPublic, courseSlug: string, assignmentSlug: string): Promise<Submission[]>

  /** Деталь сдачи одного ученика + история версий — только учителю. */
  getSubmissionDetail(
    actor: UserPublic,
    courseSlug: string,
    assignmentSlug: string,
    username: string,
  ): Promise<{ submission: Submission, history: SubmissionVersion[] }>

  /** Поставить оценку и комментарий, вернуть работу ученику. */
  gradeSubmission(
    actor: UserPublic,
    courseSlug: string,
    assignmentSlug: string,
    username: string,
    input: { grade: number | null, feedback: string },
  ): Promise<Submission>
}
