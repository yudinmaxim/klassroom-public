import { requirePermission } from '../../utils/can'
import { computeMemberships } from '../../utils/memberships'

/**
 * Список аккаунтов платформы (пермишен users.view.platform — только админ).
 * Поддерживает серверные фильтры: q (логин/имя), role, course (slug),
 * group (название) и пагинацию page/pageSize.
 */
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, 'users.view.platform')
  const query = getQuery(event)

  const q = String(query.q ?? '').trim().toLowerCase()
  const role = String(query.role ?? '')
  const course = String(query.course ?? '')
  const group = String(query.group ?? '')
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))

  const users = await useUserStore().listUsers()
  const memberships = await computeMemberships(actor)

  const filtered = users.filter((u) => {
    if (q && !u.username.toLowerCase().includes(q) && !u.pseudonym.toLowerCase().includes(q)) return false
    if (role && u.role !== role) return false
    const mem = memberships[u.username] ?? []
    if (course && !mem.some(m => m.slug === course)) return false
    if (group && !mem.some(m => m.groups.includes(group))) return false
    return true
  })

  const slice = filtered.slice((page - 1) * pageSize, page * pageSize)
  const pageMemberships = Object.fromEntries(
    slice.map(u => [u.username, memberships[u.username] ?? []]),
  )

  // опции фильтров — по полному набору memberships
  const courseMap = new Map<string, string>()
  const groupSet = new Set<string>()
  for (const list of Object.values(memberships)) {
    for (const m of list) {
      courseMap.set(m.slug, m.title)
      for (const g of m.groups) groupSet.add(g)
    }
  }

  return {
    users: slice,
    total: filtered.length,
    page,
    pageSize,
    memberships: pageMemberships,
    options: {
      courses: [...courseMap.entries()].map(([slug, title]) => ({ slug, title })),
      groups: [...groupSet].sort((a, b) => a.localeCompare(b, 'ru')),
    },
  }
})
