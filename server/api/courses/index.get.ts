import { requireUser } from '../../lib/validation'

/** Курсы, доступные текущему пользователю. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { courses: await useContentStore().listCourses(user) }
})
