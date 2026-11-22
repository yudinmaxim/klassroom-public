import { readdir } from 'node:fs/promises'
import type { RoleDef, RoleScope } from '#shared/types'
import { builtinDefaultsFor } from '../lib/permissions'
import { readYaml, resolveDataPath, writeYaml, atomicDelete } from '../lib/atomic'
import type { RoleStore } from '../ports/role-store'

interface RoleFile {
  name: string
  title: string
  scope: RoleScope
  permissions: string[]
}

function rolePath(baseDir: string, name: string): string {
  return resolveDataPath(baseDir, `${name}.yml`)
}

export function createFilesRoleStore(baseDir: string): RoleStore {
  async function fileRoles(): Promise<Map<string, RoleDef>> {
    const map = new Map<string, RoleDef>()
    let files: string[] = []
    try {
      files = await readdir(baseDir)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    for (const f of files.filter(f => f.endsWith('.yml'))) {
      const def = await readYaml<RoleFile>(resolveDataPath(baseDir, f))
      if (def?.name) {
        map.set(def.name, {
          name: def.name,
          title: def.title,
          scope: def.scope,
          permissions: def.permissions,
          builtin: builtinDefaultsFor(def.name) !== null,
        })
      }
    }
    return map
  }

  return {
    async listRoles() {
      const files = await fileRoles()
      const result: RoleDef[] = []
      for (const builtin of Object.keys({ admin: 1, teacher: 1, student: 1 })) {
        result.push(files.get(builtin) ?? builtinDefaultsFor(builtin)!)
      }
      for (const [name, def] of files) {
        if (name !== 'admin' && name !== 'teacher' && name !== 'student') result.push(def)
      }
      return result.sort((a, b) => (a.builtin === b.builtin ? a.name.localeCompare(b.name) : a.builtin ? -1 : 1))
    },

    async getRole(name) {
      const files = await fileRoles()
      return files.get(name) ?? builtinDefaultsFor(name)
    },

    async saveRole(input) {
      const def: RoleFile = {
        name: input.name,
        title: input.title.trim(),
        scope: input.scope,
        permissions: [...input.permissions],
      }
      await writeYaml(rolePath(baseDir, def.name), def)
      return {
        name: def.name,
        title: def.title,
        scope: def.scope,
        permissions: def.permissions,
        builtin: builtinDefaultsFor(def.name) !== null,
      }
    },

    async deleteRole(name) {
      const path = rolePath(baseDir, name)
      await atomicDelete(path)
    },
  }
}
