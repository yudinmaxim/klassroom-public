import type { H3Event } from 'h3'
import type { Role, UserPublic } from '#shared/types'
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

export const roleSchema = z.enum(['admin', 'teacher', 'student'])

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

export async function requireRole(event: H3Event, ...roles: Role[]): Promise<UserPublic> {
  const user = await requireUser(event)
  if (!roles.includes(user.role)) httpError(403, 'Недостаточно прав')
  return user
}
