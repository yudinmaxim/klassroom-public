import type { UserPublic } from '#shared/types'
import { useContentStore } from './content-store'
import { useUserStore } from './user-store'

export interface MembershipEntry {
  slug: string
  title: string
  groups: string[]
}

/**
 * Карта «username → курсы и группы» по всем пользователям платформы.
 * Используется там, где нужна агрегация ростеров и групп (админка).
 */
export async function computeMemberships(actor: UserPublic): Promise<Record<string, MembershipEntry[]>> {
  const store = useContentStore()
  const summaries = await store.listCourses(actor)
  const users = await useUserStore().listUsers()

  const memberships: Record<string, MembershipEntry[]> = {}
  for (const u of users) {
    const list: MembershipEntry[] = []
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
  return memberships
}
