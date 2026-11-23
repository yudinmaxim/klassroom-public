import { resolve } from 'node:path'
import { createJiti } from 'jiti'

const root = resolve(import.meta.dirname, '..')
const jiti = createJiti(import.meta.url, {
  alias: {
    '#shared/types': resolve(root, 'shared/types.ts'),
    '#shared/permissions-catalog': resolve(root, 'shared/permissions-catalog.ts'),
    '#shared/errors': resolve(root, 'shared/errors.ts'),
    '#shared/url': resolve(root, 'shared/url.ts'),
  },
})

await jiti.import(resolve(root, 'scripts/seed-data.ts'))
