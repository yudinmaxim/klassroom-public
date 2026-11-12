/**
 * Каталог пермишенов (specs/08-roles-permissions.md).
 * Единый источник: сервер (проверки) и UI (страница ролей).
 * Коды не переименовываются; новые только добавляются.
 */

export const PERMISSION_GROUPS = ['platform', 'courses', 'materials', 'assignments', 'schedule'] as const

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number]

export interface PermissionMeta {
  code: string
  title: string
  group: PermissionGroup
}

export const PERMISSION_CATALOG: PermissionMeta[] = [
  // Аккаунты (platform)
  { code: 'users.view.platform', title: 'Список всех аккаунтов платформы', group: 'platform' },
  { code: 'users.create.role.any', title: 'Создание аккаунтов любых ролей', group: 'platform' },
  { code: 'users.create.student', title: 'Создание аккаунтов учеников', group: 'platform' },
  { code: 'users.manage', title: 'Сброс пароля, правка псевдонима, удаление аккаунта', group: 'platform' },
  { code: 'users.qr.generate', title: 'Генерация QR-входа для учеников своих курсов', group: 'platform' },
  { code: 'roles.manage', title: 'Управление ролями и их пермишенами', group: 'platform' },

  // Курсы
  { code: 'courses.create', title: 'Создание курсов', group: 'courses' },
  { code: 'courses.view', title: 'Просмотр курса и его содержимого', group: 'courses' },
  { code: 'courses.manage', title: 'Настройки курса (название, описание, шкала)', group: 'courses' },
  { code: 'courses.roster.view', title: 'Состав курса (псевдонимы)', group: 'courses' },
  { code: 'courses.roster.manage', title: 'Зачисление и исключение учеников', group: 'courses' },
  { code: 'courses.archive', title: 'Архивация курса', group: 'courses' },

  // Материалы
  { code: 'materials.create', title: 'Создание материалов', group: 'materials' },
  { code: 'materials.edit', title: 'Редактирование материалов', group: 'materials' },
  { code: 'materials.view', title: 'Чтение материалов и вложений', group: 'materials' },

  // Домашние задания
  { code: 'assignments.create', title: 'Создание и публикация заданий', group: 'assignments' },
  { code: 'assignments.view', title: 'Чтение заданий курса', group: 'assignments' },
  { code: 'submissions.create', title: 'Сдача ДЗ', group: 'assignments' },
  { code: 'submissions.view.all', title: 'Просмотр всех сдач курса', group: 'assignments' },
  { code: 'submissions.view.own', title: 'Просмотр своих сдач', group: 'assignments' },
  { code: 'submissions.grade', title: 'Оценка, комментарий, возврат работ', group: 'assignments' },
  { code: 'submissions.resubmit', title: 'Пересдача после возврата', group: 'assignments' },

  // Расписание
  { code: 'schedule.manage', title: 'Слоты и исключения расписания курса', group: 'schedule' },
  { code: 'schedule.view', title: 'Просмотр расписания курса', group: 'schedule' },
  { code: 'calendar.view', title: 'Месячный календарь по своим/зачисленным курсам', group: 'schedule' },
] as const

export type PermissionCode = (typeof PERMISSION_CATALOG)[number]['code']

export const PERMISSION_CODES: PermissionCode[] = PERMISSION_CATALOG.map(p => p.code)

export const GROUP_TITLES: Record<PermissionGroup, string> = {
  platform: 'Аккаунты',
  courses: 'Курсы',
  materials: 'Материалы',
  assignments: 'Домашние задания',
  schedule: 'Расписание',
}
