import { requireUser, courseSlugSchema } from '../../../lib/validation'
import { httpError } from '../../../lib/errors'

/** Загрузить обложку курса (courses.manage). multipart/form-data, поле «file». */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(p => p.filename && p.name === 'file')
  if (!filePart) httpError(400, 'Ожидается файл в поле «file»')

  const name = await useContentStore().setCourseCover(actor, slug, {
    name: filePart.filename,
    data: filePart.data,
  })
  return { cover: name }
})
