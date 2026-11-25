import { requireUser, courseSlugSchema } from '../../../lib/validation'
import { httpError } from '../../../lib/errors'

/**
 * Переход по внешней ссылке: записывает клик (entity из ?e=) и делает 302.
 * Ссылки в markdown и блок «Ссылки» ведут сюда — так считается,
 * переходил ли ученик по источнику.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const q = getQuery(event)
  const to = typeof q.to === 'string' ? q.to : ''
  const entity = typeof q.e === 'string' ? q.e : ''

  if (!/^https?:\/\//i.test(to) || to.length > 2000) {
    httpError(400, 'Некорректная ссылка')
  }

  // запись клика не должна ломать переход (нет прав/сущности — просто редиректим)
  try {
    await useContentStore().recordLinkClick(actor, slug, entity, to)
  } catch { /* ignore */ }

  return sendRedirect(event, to, 302)
})
