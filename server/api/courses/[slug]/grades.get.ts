import { requireUser, courseSlugSchema } from '../../../lib/validation'
import type { GradebookRow } from '#shared/types'

/** Журнал оценок курса: учителю — все ученики, ученику — только своя строка. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const book = await useContentStore().getGradebook(actor, slug)

  // псевдонимы для отображения имени над логином
  const users = await useUserStore().listUsers()
  const names = new Map(users.map(u => [u.username, u.pseudonym]))
  for (const row of book.rows as GradebookRow[]) {
    row.name = names.get(row.student)
  }
  return book
})
