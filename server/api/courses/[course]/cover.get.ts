import { requireUser, courseSlugSchema } from '../../../lib/validation'
import { httpError } from '../../../lib/errors'

/** Отдать обложку курса (inline, доступ на просмотр проверяет адаптер). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))

  const file = await useContentStore().getCourseCover(actor, slug)
  if (!file) httpError(404, 'Обложка не найдена')

  setHeader(event, 'content-type', file.mime)
  setHeader(event, 'content-disposition', 'inline')
  setHeader(event, 'cache-control', 'private, no-cache')
  return file.data
})
