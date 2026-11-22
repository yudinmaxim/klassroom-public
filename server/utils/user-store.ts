import type { UserStore } from '../ports/user-store'
import { createFilesUserStore } from '../adapters/files-user-store'

/**
 * Точка доступа к порту UserStore (автоимпортируется Nitro из server/utils).
 * Адаптер выбирается один раз за жизнь процесса; в будущем — по конфигу
 * (KLASSROOM_STORE, specs/01-architecture.md).
 */
export type { UserStore }

let instance: UserStore | null = null

export function useUserStore(): UserStore {
  if (!instance) {
    instance = createFilesUserStore(useRuntimeConfig().usersDir)
  }
  return instance
}
