import { requireUser, courseSlugSchema, assignmentSlugSchema, usernameSchema } from '../../../../../../../lib/validation'
import { httpError } from '../../../../../../../lib/errors'

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** Приложить файл к своей сдаче (только владелец-ученик, multipart «file»). */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  const username = usernameSchema.parse(getRouterParam(event, 'username'))

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(p => p.filename && p.name === 'file')
  if (!filePart) httpError(400, 'Ожидается файл в поле «file»')
  if (filePart.data.length > MAX_ATTACHMENT_BYTES) httpError(400, 'Файл больше 10 МБ')
  if (!filePart.data.length) httpError(400, 'Файл пустой')

  const name = await useContentStore().addSubmissionAttachment(actor, slug, aid, username, {
    name: filePart.filename,
    data: filePart.data,
  })
  return { name }
})
