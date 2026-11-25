import { requireUser, courseSlugSchema } from '../../../lib/validation'
import type { LinkStat } from '#shared/types'

/** Статистика переходов по внешней ссылке сущности (topic:/assign:/sub:). Только проверяющим. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const entity = String(getQuery(event).e ?? '')

  const stats: LinkStat[] = await useContentStore().getLinkStats(actor, slug, entity)

  // username → псевдоним для отображения
  const userStore = useUserStore()
  for (const s of stats) {
    for (const u of s.users) {
      const usr = await userStore.getUser(u.username)
      u.pseudonym = usr?.pseudonym ?? u.username
    }
  }
  return { stats }
})
