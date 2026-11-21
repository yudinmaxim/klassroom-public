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

// --- Домашние задания (шаг 4, specs/02-data-model.md) ---

/** Тип задания: общее — всему курсу, частное — выбранным ученикам (audience). */
export type AssignmentType = 'general' | 'private'

/** Статус жизненного цикла задания. «Выдано/Не выдано» — для UI. */
export type AssignmentStatus = 'draft' | 'published'

/** Краткое представление задания в списке курса. */
export interface AssignmentSummary {
  slug: string
  title: string
  type: AssignmentType
  status: AssignmentStatus
  /** ISO-дата дедлайна или null. */
  due: string | null
  submissionCount: number
  /** Свой статус сдачи для ученика: none|submitted|returned. */
  myStatus?: 'none' | 'submitted' | 'returned'
  /** Оценка своей сдачи (для индикации в списке). */
  myGrade?: number | null
  /** Время последнего комментария в своём треде сдачи (ISO). */
  myLastCommentAt?: string | null
  updatedAt: string
}

/** Задание целиком: метаданные + отрендеренное описание. */
export interface Assignment {
  slug: string
  title: string
  type: AssignmentType
  /** username'ы для частного задания; для general — пусто. */
  audience: string[]
  status: AssignmentStatus
  due: string | null
  maxPoints: number | null
  createdAt: string
  updatedAt: string
  /** markdown-описание. */
  description: string
  /** санитизированный HTML описания. */
  html: string
  /** Пересдача разрешена по умолчанию для всех (default true). */
  allowResubmit: boolean
  /** Индивидуальные переопределения пересдачи — только для проверяющих. */
  resubmitOverrides: Record<string, boolean>
  /** Эффективное правило для текущего пользователя. */
  canResubmit: boolean
}

/** Сдача ученика. */
export interface Submission {
  username: string
  /** submitted — сдано, ждёт проверки; returned — проверено/возвращено. */
  status: 'submitted' | 'returned'
  grade: number | null
  feedback: string
  answer: string
  /** санитизированный HTML ответа (рендерится из markdown при чтении). */
  html: string
  submittedAt: string | null
  updatedAt: string | null
  /** Имена файлов-вложений сдачи (submissions/<user>/attachments/). */
  attachments?: string[]
}

/** Пост в общей ленте курса (courses/<slug>/stream/<pid>.yml). */
export interface StreamPost {
  id: string
  /** username автора (ученик или учитель) */
  author: string
  /** markdown-исходник */
  text: string
  /** санитизированный html, отрендеренный при записи */
  html: string
  createdAt: string
  /** Время последнего комментария (для индикации непрочитанных). */
  lastCommentAt?: string | null
}

/** Комментарий к посту ленты (courses/<slug>/stream/<pid>/comments/<cid>.yml). */
export interface StreamComment {
  id: string
  /** username автора (ученик или учитель) */
  author: string
  /** markdown-исходник */
  text: string
  /** санитизированный html, отрендеренный при записи */
  html: string
  createdAt: string
}

/** Пост ленты с привязкой к курсу (глобальная лента /stream). */
export interface StreamFeedPost extends StreamPost {
  /** slug курса-владельца. */
  course: string
  courseTitle: string
}

/** Журнал оценок одного курса в глобальной сводке /grades. */
export interface GradebookSection {
  course: { slug: string, title: string }
  book: Gradebook
}

/** Ячейка журнала: сдача ученика по одному заданию. */
export interface GradebookCell {
  /** slug задания — для ссылки на страницу задания. */
  assignmentSlug: string
  /** id задания (директория). */
  assignmentId: string
  status: 'none' | 'submitted' | 'returned'
  grade: number | null
  maxPoints: number | null
  submittedAt: string | null
  updatedAt: string | null
}

/** Строка журнала — один ученик. */
export interface GradebookRow {
  student: string
  /** true — строка принадлежит текущему пользователю (подсветка). */
  mine?: boolean
  cells: GradebookCell[]
}

/** Журнал оценок курса. */
export interface Gradebook {
  /** Колонки = опубликованные задания (порядок как в журнале). */
  assignments: { slug: string, id: string, title: string, due: string | null }[]
  rows: GradebookRow[]
  /** true — учитель видит всех; false — ученик видит только свою строку. */
  canSeeAll: boolean
}

/** Комментарий в треде сдачи (submissions/<user>/comments/<cid>.yml). */
export interface SubmissionComment {
  id: string
  /** username автора (ученик или учитель) */
  author: string
  /** markdown-исходник */
  text: string
  /** санитизированный html, отрендеренный при записи */
  html: string
  createdAt: string
}

/** Ответ GET /api/courses/:slug — шапка раздела курса (без списков и ростера). */
export interface CoursePageData {
  course: Course
  canManage: boolean
  canMaterials: boolean
  canAssignments: boolean
  canViewRoster: boolean
}

/** Событие уведомления (SSE /notify). Эфемерное — без истории. */
export interface NotifyPayload {
  type:
    | 'assignment.published'
    | 'assignment.unpublished'
    | 'material.created'
    | 'material.updated'
    | 'submission.created'
    | 'submission.graded'
    | 'comment.created'
    | 'stream.posted'
    | 'stream.comment.created'
    | 'roster.changed'
    | 'roster.enrolled'
  /** slug курса — для ссылки и контекста */
  course: string
  title: string
  /** Куда вести по клику на уведомление */
  url: string
  /** псевдоним автора действия */
  actor?: string
  /** короткая деталь (например, оценка) */
  detail?: string
  /** username владельца сдачи — для comment.created (тред per-submission) */
  username?: string
  /** true — только live-обновление данных, без тоста */
  silent?: boolean
  at: string
}

/** Одна версия сдачи в истории пересдач (submissions/<user>/history/). */
export interface SubmissionVersion {
  /** Имя файла версии в history/ (без расширения) — для ссылок на вложения. */
  file: string
  submittedAt: string
  grade: number | null
  feedback: string
  answer: string
  /** санитизированный HTML ответа версии. */
  html: string
  /** Имена файлов-вложений этой версии (history/<file>/attachments/). */
  attachments: string[]
}
