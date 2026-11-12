import type { ContentStore } from '../ports/content-store'
import { createFilesContentStore } from '../adapters/files-content-store'
import { createGitJournal, type GitJournal } from '../lib/git-journal'
import { resolve } from 'node:path'

/**
 * Точки доступа к порту ContentStore и git-журналу (автоимпорт Nitro).
 * Адаптер один на процесс; переезд на БД = новый адаптер + этот файл.
 */
export type { ContentStore }

let journalInstance: GitJournal | null = null
let storeInstance: ContentStore | null = null

export function useGitJournal(): GitJournal {
  if (!journalInstance) {
    journalInstance = createGitJournal(resolve(useRuntimeConfig().contentDir))
  }
  return journalInstance
}

export function useContentStore(): ContentStore {
  if (!storeInstance) {
    storeInstance = createFilesContentStore(resolve(useRuntimeConfig().contentDir), useGitJournal())
  }
  return storeInstance
}
