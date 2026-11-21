import { requireUser, courseSlugSchema, assignmentSlugSchema, usernameSchema, attachmentNameSchema } from '../../../../../../../../../../lib/validation'
import { httpError } from '../../../../../../../../../../lib/errors'

/** Скачать вложение конкретной версии сдачи из истории. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const file = getRouterParam(event, 'file') ?? ''
  const name = attachmentNameSchema.parse(decodeURIComponent(getRouterParam(event, 'name') ?? ''))

  const fileData = await useContentStore().getSubmissionHistoryAttachment(actor, slug, aid, username, file, name)
  if (!fileData) httpError(404, 'Файл не найден')

  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const inline = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'pdf', 'mp3', 'mp4', 'webm'].includes(ext)

  setHeader(event, 'content-type', fileData.mime)
  setHeader(event, 'content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`)
  setHeader(event, 'cache-control', 'private, no-cache')
  return fileData.data
})
