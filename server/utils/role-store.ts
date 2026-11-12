import type { RoleStore } from '../ports/role-store'
import { createFilesRoleStore } from '../adapters/files-role-store'
import { resolve } from 'node:path'

/** Точка доступа к порту RoleStore (автоимпорт Nitro). */
export type { RoleStore }

let instance: RoleStore | null = null

export function useRoleStore(): RoleStore {
  if (!instance) {
    instance = createFilesRoleStore(resolve(useRuntimeConfig().rolesDir))
  }
  return instance
}
