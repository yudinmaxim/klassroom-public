import { requireUser, courseSlugSchema, materialSlugSchema } from '../../../../../../lib/validation'
import { httpError } from '../../../../../../lib/errors'

/** Лимит размера одного вложения. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** Приложить файл к материалу (materials.edit). multipart/form-data. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'topic'))

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(p => p.filename && p.name === 'file')
  if (!filePart) httpError(400, 'Ожидается файл в поле «file»')
  if (filePart.data.length > MAX_ATTACHMENT_BYTES) {
    httpError(400, 'Файл больше 10 МБ')
  }
  if (!filePart.data.length) httpError(400, 'Файл пустой')

  const name = await useContentStore().addAttachment(actor, slug, materialSlug, {
    name: filePart.filename,
    data: filePart.data,
  })
  return { name }
})
