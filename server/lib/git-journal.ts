import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/**
 * Git-журнал контента (specs/03-git-journal.md).
 *
 * Роли git: журнал истории (аудит + undo) и транспорт бэкапов; истина — файлы.
 * Система НИКОГДА не читает git как данные.
 *
 * Механика:
 *  - `content/` инициализируется как git-репозиторий при первой мутации;
 *  - мутации коалесцируют в один коммит через debounce-окно (10 с);
 *  - автор действия — псевдоним из контекста запроса, коммитер — `system`;
 *  - коммиты сериализуются одним воркером (репозиторий локальный и
 *    однонаправленный, конфликтов слияния не бывает).
 */

const DEBOUNCE_MS = 10_000

export interface GitJournal {
  /** Отметить мутацию контента. Ничего не делает синхронно. */
  record(actorPseudonym: string, action: string): void
  /** Принудительно свести накопленные мутации в коммит (используется на close). */
  flushNow(): Promise<void>
}

export function createGitJournal(repoDir: string): GitJournal {
  let timer: ReturnType<typeof setTimeout> | null = null
  let messages: string[] = []
  let initialized = false
  let chain: Promise<void> = Promise.resolve()

  const git = (args: string[]) => exec('git', args, { cwd: repoDir })

  async function ensureInit(): Promise<void> {
    if (initialized) return
    if (!existsSync(join(repoDir, '.git'))) {
      await mkdir(repoDir, { recursive: true })
      await git(['init', '-b', 'main'])
    }
    initialized = true
  }

  async function commit(): Promise<void> {
    if (!messages.length) return
    const message = [...new Set(messages)].join('; ')
    messages = []
    await ensureInit()
    await git(['add', '-A'])
    try {
      await git([
        '-c', 'user.name=wikiroom',
        '-c', 'user.email=wikiroom@localhost',
        'commit', '-m', message,
      ])
    } catch (err) {
      // exit 1 при «nothing to commit» — не ошибка: файлы уже записаны на диск
      const e = err as { stderr?: string }
      if (!e.stderr?.includes('nothing to commit')) throw err
    }
  }

  function schedule(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      chain = chain.then(commit).catch(() => undefined)
    }, DEBOUNCE_MS)
  }

  return {
    record(actorPseudonym, action) {
      messages.push(`${actorPseudonym}: ${action}`)
      schedule()
    },

    async flushNow() {
      if (timer) clearTimeout(timer)
      timer = null
      chain = chain.then(commit).catch(() => undefined)
      await chain
    },
  }
}
