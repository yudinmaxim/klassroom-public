import { requirePermission } from '../../utils/can'

/**
 * Карта «пользователь → курсы и группы» для админ-панели.
 * Пермишен users.view.platform — только админ.
 */
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, 'users.view.platform')
  const store = useContentStore()

  const summaries = await store.listCourses(actor)
  const users = await useUserStore().listUsers()

  const memberships: Record<string, Array<{ slug: string, title: string, groups: string[] }>> = {}
  for (const u of users) {
    const list: Array<{ slug: string, title: string, groups: string[] }> = []
    for (const s of summaries) {
      const course = await store.getCourse(actor, s.slug)
      if (!course?.students.includes(u.username)) continue
      const groups = (await store.listGroups(actor, s.slug))
        .filter(g => g.members.includes(u.username))
        .map(g => g.title)
      list.push({ slug: s.slug, title: s.title, groups })
    }
    memberships[u.username] = list
  }
  return { memberships }
})
