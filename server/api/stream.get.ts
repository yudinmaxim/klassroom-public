import { requireUser } from '../lib/validation'

/** Глобальная лента: посты всех курсов пользователя (до 100, свежие первыми). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  return useContentStore().listStreamFeed(actor)
})
