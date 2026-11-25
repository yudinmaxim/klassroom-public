import { requireUser, courseSlugSchema, materialSlugSchema, attachmentNameSchema } from '../../../../../../lib/validation'
import { httpError } from '../../../../../../lib/errors'

/**
 * Выдать вложение (пермишен materials.view проверяет адаптер).
 * Все файлы отдаются на скачивание (Content-Disposition), кроме
 * картинок в белом списке — они встроены в markdown.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'course'))
  const materialSlug = materialSlugSchema.parse(getRouterParam(event, 'id'))
  const name = attachmentNameSchema.parse(decodeURIComponent(getRouterParam(event, 'name') ?? ''))

  const file = await useContentStore().getAttachment(actor, slug, materialSlug, name)
  if (!file) httpError(404, 'Файл не найден')

  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const inline = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'pdf', 'mp3', 'mp4', 'webm'].includes(ext)

  setHeader(event, 'content-type', file.mime)
  setHeader(event, 'content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`)
  setHeader(event, 'cache-control', 'private, no-cache')
  return file.data
})
