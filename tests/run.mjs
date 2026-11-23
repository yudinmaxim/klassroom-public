import { createJiti } from 'jiti'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, {
  alias: {
    '#shared/types': resolve(root, 'shared/types.ts'),
    '#shared/permissions-catalog': resolve(root, 'shared/permissions-catalog.ts'),
    '#shared/errors': resolve(root, 'shared/errors.ts'),
    '#shared/url': resolve(root, 'shared/url.ts'),
  },
})

// node:test регистрирует и запускает тесты при импорте
await jiti.import(resolve(root, 'tests/groups.test.ts'))
