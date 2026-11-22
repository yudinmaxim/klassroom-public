import { requireUser } from '../lib/validation'

/** Сводка журналов оценок по всем курсам пользователя. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  return useContentStore().listGradebooks(actor)
})
