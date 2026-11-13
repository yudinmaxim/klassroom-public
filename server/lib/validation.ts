import type { H3Event } from 'h3'
import type { UserPublic } from '#shared/types'
import { PERMISSION_CATALOG } from '#shared/permissions-catalog'
import { z } from 'zod'
import { httpError } from './errors'
import { readSessionUser } from './sessions'

/** Схемы входных данных (zod) + авторизационные хелперы роутов. */

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{2,31}$/, 'Логин: строчные латинские буквы, цифры, дефис; 3–32 символа')

export const pseudonymSchema = z
  .string()
  .trim()
  .min(2, 'Псевдоним: минимум 2 символа')
  .max(40, 'Псевдоним: максимум 40 символов')
  // без управляющих символов и переносов строк
  .refine(
    v => !Array.from(v).some(ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127),
    'Недопустимые символы в псевдониме',
  )

export const passwordSchema = z
  .string()
  .min(8, 'Пароль: минимум 8 символов')
  .max(128, 'Пароль: максимум 128 символов')

export const roleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-]{1,31}$/, 'Код роли: строчные латинские буквы, цифры, дефис; 2–32 символа')

export const roleScopeSchema = z.enum(['none', 'owner', 'member'])

export const saveRoleBodySchema = z.object({
  title: z.string().trim().min(2).max(40),
  scope: roleScopeSchema,
  permissions: z.array(z.string()).max(PERMISSION_CATALOG.length),
})

export const roleNameParamSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-]{1,31}$/)

export const setupBodySchema = z.object({
  username: usernameSchema,
  pseudonym: pseudonymSchema,
  password: passwordSchema,
})

export const loginBodySchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Введите пароль').max(128),
})

export const createUserBodySchema = z.object({
  username: usernameSchema,
  pseudonym: pseudonymSchema,
  role: roleSchema,
  password: passwordSchema.optional(),
})

export const resetPasswordBodySchema = z.object({
  password: passwordSchema.optional(),
})

// --- Курсы (шаг 2) ---

export const courseSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'Slug курса: строчные латинские буквы, цифры, дефис; 2–64 символа')

export const gradingScaleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('grade5') }),
  z.object({ type: z.literal('points'), max: z.number().int().min(1).max(1000).default(100) }),
  z.object({ type: z.literal('passfail') }),
])

export const createCourseBodySchema = z.object({
  title: z.string().trim().min(3, 'Название: минимум 3 символа').max(120),
  description: z.string().trim().max(2000).optional(),
  slug: courseSlugSchema.optional(),
  gradingScale: gradingScaleSchema.optional(),
})

export const updateCourseBodySchema = z.object({
  title: z.string().trim().min(3, 'Название: минимум 3 символа').max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  gradingScale: gradingScaleSchema.optional(),
})

export const rosterBodySchema = z.object({
  username: usernameSchema,
  action: z.enum(['add', 'remove']),
})

// --- Материалы (шаг 3, specs/04-plugins.md) ---

/** Лимит на текст материала: ~100 страниц markdown. */
const MAX_MD_CHARS = 200_000

export const materialSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'Slug материала: строчные латинские буквы, цифры, дефис; 2–64 символа')

export const materialTypeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-]{0,31}$/, 'Некорректный тип материала')

export const createMaterialBodySchema = z.object({
  title: z.string().trim().min(3, 'Название: минимум 3 символа').max(120),
  type: materialTypeSchema.default('doc'),
  content: z.string().max(MAX_MD_CHARS, 'Текст материала слишком длинный').default(''),
})

export const updateMaterialBodySchema = z.object({
  title: z.string().trim().min(3, 'Название: минимум 3 символа').max(120).optional(),
  content: z.string().max(MAX_MD_CHARS, 'Текст материала слишком длинный').optional(),
})

export const renderMarkdownBodySchema = z.object({
  course: courseSlugSchema,
  material: materialSlugSchema.optional(),
  content: z.string().max(MAX_MD_CHARS, 'Текст слишком длинный'),
})

/** Имя файла вложения (URL-параметр; строгую проверку делает адаптер). */
export const attachmentNameSchema = z
  .string()
  .trim()
  .regex(/^[^\\/%?#]{1,80}$/, 'Некорректное имя файла')

/** Разобрать и провалидировать JSON-тело запроса. */
export async function parseJson<S extends z.ZodTypeAny>(
  event: H3Event,
  schema: S,
): Promise<z.infer<S>> {
  const result = schema.safeParse(await readBody(event))
  if (!result.success) {
    httpError(400, result.error.issues[0]?.message ?? 'Некорректные данные')
  }
  return result.data
}

export async function requireUser(event: H3Event): Promise<UserPublic> {
  const user = await readSessionUser(event)
  if (!user) httpError(401, 'Требуется вход')
  return user
}

export async function requireRole(event: H3Event, ...roles: string[]): Promise<UserPublic> {
  const user = await requireUser(event)
  if (!roles.includes(user.role)) httpError(403, 'Недостаточно прав')
  return user
}

// --- Задания (шаг 4) ---

export const assignmentSlugSchema = materialSlugSchema

export const assignmentTypeSchema = z.enum(['general', 'private'])

export const assignmentStatusSchema = z.enum(['draft', 'published'])

export const createAssignmentBodySchema = z.object({
  title: z.string().trim().min(3, 'Название: минимум 3 символа').max(120),
  type: assignmentTypeSchema.default('general'),
  audience: z.array(usernameSchema).max(200).default([]),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата: ГГГГ-ММ-ДД').nullable().optional(),
  maxPoints: z.number().int().min(1).max(1000).nullable().optional(),
  description: z.string().max(MAX_MD_CHARS, 'Описание слишком длинное').default(''),
})

export const updateAssignmentBodySchema = createAssignmentBodySchema
  .partial()
  .extend({ status: assignmentStatusSchema.optional() })

/** Комментарий в треде сдачи. */
export const commentBodySchema = z.object({
  text: z.string().trim().min(1, 'Пустой комментарий').max(8000, 'Комментарий слишком длинный'),
})

export const submitAssignmentBodySchema = z.object({
  answer: z.string().min(1, 'Ответ пустой').max(MAX_MD_CHARS, 'Ответ слишком длинный'),
})

export const gradeSubmissionBodySchema = z.object({
  grade: z.number().min(0).max(1000).nullable(),
  feedback: z.string().max(4000).default(''),
})
