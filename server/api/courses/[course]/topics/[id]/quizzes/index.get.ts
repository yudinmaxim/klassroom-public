import { requireUser, courseSlugSchema, materialSlugSchema } from '../../../../../../lib/validation'

/** Список проверок «Закрепление» темы (сводки; ученику — с его статистикой). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'id'))

  const quizzes = await useContentStore().listQuizzes(actor, slug, materialSlug)
  return { quizzes }
})
