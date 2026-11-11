import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { deleteCookie, getCookie, setCookie } from 'h3'
import type { UserPublic } from '#shared/types'

/**
 * Файловые сессии (specs/02-data-model.md): Nitro storage mount 'sessions'
 * (fs-драйвер), ключи вида <id>. Переживают рестарт процесса.
 */

export const SESSION_COOKIE = 'wr_session'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 дней

interface SessionRecord {
  user: UserPublic
  expiresAt: number
}

function sessionsStorage() {
  return useStorage('sessions')
}

function isSecure(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** Создать сессию и выставить куку. */
export async function createSession(event: H3Event, user: UserPublic): Promise<string> {
  const id = randomBytes(32).toString('hex')
  const record: SessionRecord = { user, expiresAt: Date.now() + SESSION_TTL_MS }
  await sessionsStorage().setItem(id, record)
  setCookie(event, SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(),
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
  return id
}

/** Текущий пользователь или null (истёкшая/битая сессия удаляется). */
export async function readSessionUser(event: H3Event): Promise<UserPublic | null> {
  const id = getCookie(event, SESSION_COOKIE)
  if (!id) return null
  const record = await sessionsStorage().getItem<SessionRecord | null>(id)
  if (!record) return null
  if (Date.now() > record.expiresAt) {
    await sessionsStorage().removeItem(id)
    return null
  }
  return record.user
}

export async function destroySession(event: H3Event): Promise<void> {
  const id = getCookie(event, SESSION_COOKIE)
  if (id) await sessionsStorage().removeItem(id)
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

/** Удалить все сессии пользователя (используется при сбросе пароля). */
export async function destroyUserSessions(username: string): Promise<void> {
  const storage = sessionsStorage()
  const keys = await storage.getKeys()
  for (const key of keys) {
    const record = await storage.getItem<SessionRecord | null>(key)
    if (record?.user.username === username) await storage.removeItem(key)
  }
}
