import { requireUser, courseSlugSchema } from '../../../../lib/validation'

/** Список заданий курса (assignments.view, область роли — проверяет адаптер). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const assignments = await useContentStore().listAssignments(actor, slug)

  // Менеджеру показываем audience псевдонимами (usernames → pseudonym)
  const names = [...new Set(assignments.flatMap(a => a.audience ?? []))]
  if (names.length) {
    const userStore = useUserStore()
    const labels = new Map<string, string>()
    await Promise.all(names.map(async u => {
      const user = await userStore.getUser(u)
      labels.set(u, user?.pseudonym ?? u)
    }))
    for (const a of assignments) {
      if (a.audience) a.audienceNames = a.audience.map(u => labels.get(u) ?? u)
    }
  }
  return { assignments }
})
