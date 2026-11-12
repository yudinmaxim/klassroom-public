// Общие типы (используются сервером и фронтом)
export type Role = 'admin' | 'teacher' | 'student'

export interface UserPublic {
  username: string
  pseudonym: string
  role: Role
  createdAt: string
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
