import { readdir } from 'node:fs/promises'
import { hash, verify } from '@node-rs/argon2'
import type { Role, UserPublic } from '#shared/types'
import { generateReadablePassword } from '../lib/passwords'
import {
  readYaml,
  resolveDataPath,
  writeYaml,
} from '../lib/atomic'
import { httpError } from '../lib/errors'
import type { UserStore } from '../ports/user-store'

/**
 * Файловый адаптер порта UserStore (specs/02-data-model.md):
 * один аккаунт = один YAML-файл users/<username>.yml, пароль — argon2-хэш.
 * users/ находится ВНЕ content/ и в git-журнал не попадает.
 */

interface UserFile {
  username: string
  pseudonym: string
  role: Role
  passwordHash: string
  createdAt: string
}

/** Хэш-заглушка: при отсутствии аккаунта всё равно выполняем argon2-verify, */
/** чтобы не раскрывать существование логина таймингом. */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXktc2FsdA$3Q3Z0wZb0BqhflbLCbMSwt0ScS0soQfnbWKOpHwFwzI'

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function toPublic(u: UserFile): UserPublic {
  return { username: u.username, pseudonym: u.pseudonym, role: u.role, createdAt: u.createdAt }
}

function userPath(baseDir: string, username: string): string {
  return resolveDataPath(baseDir, `${username}.yml`)
}

async function readUserFile(baseDir: string, username: string): Promise<UserFile | null> {
  return readYaml<UserFile>(userPath(baseDir, username))
}

async function writeUserFile(baseDir: string, user: UserFile): Promise<void> {
  await writeYaml(userPath(baseDir, user.username), {
    username: user.username,
    pseudonym: user.pseudonym,
    role: user.role,
    createdAt: user.createdAt,
    passwordHash: user.passwordHash,
  })
}

export function createFilesUserStore(baseDir: string): UserStore {
  const resolveDir = () => resolveDataPath(baseDir)

  async function assertUserExists(username: string): Promise<UserFile> {
    const user = await readUserFile(baseDir, username)
    if (!user) httpError(404, `Пользователь «${username}» не найден`)
    return user
  }

  return {
    async countUsers() {
      try {
        const files = await readdir(resolveDir())
        return files.filter(f => f.endsWith('.yml')).length
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0
        throw err
      }
    },

    async listUsers() {
      let files: string[]
      try {
        files = await readdir(resolveDir())
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw err
      }
      const users: UserPublic[] = []
      for (const f of files.filter(f => f.endsWith('.yml'))) {
        const user = await readYaml<UserFile>(resolveDataPath(baseDir, f))
        if (user) users.push(toPublic(user))
      }
      return users.sort((a, b) => a.username.localeCompare(b.username))
    },

    async getUser(username) {
      const user = await readUserFile(baseDir, normalizeUsername(username))
      return user ? toPublic(user) : null
    },

    async createUser(input) {
      const username = normalizeUsername(input.username)
      if (await readUserFile(baseDir, username)) {
        httpError(409, `Логин «${username}» уже занят`)
      }
      const generatedPassword = input.password ? undefined : generateReadablePassword()
      const password = input.password ?? generatedPassword
      // password здесь не может быть undefined: input.password или генерация
      const passwordHash = await hash(password as string)
      const user: UserFile = {
        username,
        pseudonym: input.pseudonym.trim(),
        role: input.role,
        createdAt: new Date().toISOString(),
        passwordHash,
      }
      // атомарная запись + сериализация через очередь (specs/01-architecture.md)
      await writeUserFile(baseDir, user)
      const result: { user: UserPublic, generatedPassword?: string } = { user: toPublic(user) }
      if (generatedPassword) result.generatedPassword = generatedPassword
      return result
    },

    async resetPassword(username, password) {
      const user = await assertUserExists(normalizeUsername(username))
      const generatedPassword = password ? undefined : generateReadablePassword()
      user.passwordHash = await hash(password ?? generatedPassword as string)
      await writeUserFile(baseDir, user)
      return generatedPassword ? { generatedPassword } : {}
    },

    async authenticate(username, password) {
      const normalized = normalizeUsername(username)
      const user = await readUserFile(baseDir, normalized)
      if (!user) {
        await verify(DUMMY_HASH, password).catch(() => false)
        return null
      }
      const ok = await verify(user.passwordHash, password).catch(() => false)
      return ok ? toPublic(user) : null
    },
  }
}
