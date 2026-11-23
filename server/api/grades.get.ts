import { requireUser } from '../lib/validation'
import type { GradebookRow } from '#shared/types'

/** Сводка журналов оценок по всем курсам пользователя. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const sections = await useContentStore().listGradebooks(actor)

  // псевдонимы для отображения имени над логином
  const users = await useUserStore().listUsers()
  const names = new Map(users.map(u => [u.username, u.pseudonym]))
  for (const s of sections) {
    for (const row of s.book.rows as GradebookRow[]) {
      row.name = names.get(row.student)
    }
  }
  return sections
})
