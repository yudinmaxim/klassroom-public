import { readdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { readYaml, resolveDataPath, writeYaml, atomicDelete } from './atomic'

/**
 * Одноразовые токены QR-входа (specs/09-qr-login.md).
 * Хранение: qr-tokens/<token>.yml — токен 128 бит, без персональных данных.
 * Использование сжигает токен (файл удаляется); регенерация для пользователя
 * гасит его прежний токен.
 */

interface TokenFile {
  username: string
  createdAt: string
  expiresAt: string
}

export interface QrToken {
  token: string
  expiresAt: string
}

export interface QrTokenStore {
  /** Создать токен для пользователя (предыдущий токен пользователя гасится). */
  issue(username: string, ttlMinutes: number): Promise<QrToken>

  /** Проверить токен: одноразово вернуть имя пользователя или null. */
  consume(token: string): Promise<string | null>

  /** Текущий (несгоревший) токен пользователя, если есть. */
  currentFor(username: string): Promise<QrToken | null>
}

export function createQrTokenStore(baseDir: string): QrTokenStore {
  const tokenPath = (token: string) => resolveDataPath(baseDir, `${token}.yml`)

  async function sweepExpired(): Promise<void> {
    let files: string[]
    try {
      files = await readdir(baseDir)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      return
    }
    const now = Date.now()
    for (const f of files.filter(f => f.endsWith('.yml'))) {
      const rec = await readYaml<TokenFile>(resolveDataPath(baseDir, f))
      if (rec && Date.parse(rec.expiresAt) < now) {
        await atomicDelete(resolveDataPath(baseDir, f))
      }
    }
  }

  return {
    async issue(username, ttlMinutes) {
      await sweepExpired()
      // регенерация гасит прежний токен пользователя
      const prev = await this.currentFor(username)
      if (prev) await atomicDelete(tokenPath(prev.token))

      const token = randomBytes(16).toString('hex')
      const rec: TokenFile = {
        username,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
      }
      await writeYaml(tokenPath(token), rec)
      return { token, expiresAt: rec.expiresAt }
    },

    async consume(token) {
      // токен в URL — проверяем форму, чтобы не читать произвольные пути
      if (!/^[a-f0-9]{32}$/.test(token)) return null
      const rec = await readYaml<TokenFile>(tokenPath(token))
      if (!rec) return null
      await atomicDelete(tokenPath(token)) // одноразовость: сжигаем сразу
      if (Date.parse(rec.expiresAt) < Date.now()) return null
      return rec.username
    },

    async currentFor(username) {
      let files: string[]
      try {
        files = await readdir(baseDir)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
        return null
      }
      for (const f of files.filter(f => f.endsWith('.yml'))) {
        const token = f.replace(/\.yml$/, '')
        const rec = await readYaml<TokenFile>(resolveDataPath(baseDir, f))
        if (rec?.username === username && Date.parse(rec.expiresAt) >= Date.now()) {
          return { token, expiresAt: rec.expiresAt }
        }
      }
      return null
    },
  }
}
