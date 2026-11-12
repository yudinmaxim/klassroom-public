import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { parse, stringify } from 'yaml'

/**
 * Инфраструктура файлового слоя: атомарная запись (temp + rename) и
 * сериализация операций записи (specs/01-architecture.md — «Конкурентность»).
 * Используется ТОЛЬКО адаптерами хранилища — серверные роуты файлами не
 * занимаются напрямую (правило specs/01-architecture.md).
 */

/** Глобальная очередь записи: мутации сериализуются в порядке поступления. */
let writeQueue: Promise<unknown> = Promise.resolve()

export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn)
  // не роняем очередь на ошибке отдельной операции
  writeQueue = next.catch(() => undefined)
  return next
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

/** Атомарная запись: temp-файл в том же каталоге + rename. */
export async function atomicWriteString(path: string, data: string): Promise<void> {
  const tmp = `${path}.tmp-${randomBytes(6).toString('hex')}`
  await enqueue(async () => {
    await ensureDir(dirname(path))
    await writeFile(tmp, data, 'utf8')
    await rename(tmp, path)
  })
}

export async function readString(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function readYaml<T>(path: string): Promise<T | null> {
  const raw = await readString(path)
  return raw === null ? null : (parse(raw) as T)
}

export function writeYaml(path: string, data: unknown): Promise<void> {
  return atomicWriteString(path, stringify(data))
}

/** Атомарное «удаление» — через ту же очередь записи. */
export async function atomicDelete(path: string): Promise<void> {
  await enqueue(async () => {
    await rm(path, { force: true })
  })
}

export function resolveDataPath(base: string, ...parts: string[]): string {
  return resolve(base, ...parts)
}
