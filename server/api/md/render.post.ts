import { requireUser, parseJson, renderMarkdownBodySchema } from '../../lib/validation'
import { httpError } from '../../lib/errors'
import { renderDocMarkdown } from '../../lib/md'
import type { DocPayload } from '#shared/types'

/**
 * Санитизированный предпросмотр markdown (используется редактором материала).
 * Тексты `[[ссылок]]` резолвятся по реальным материалам курса.
 * Право чтения курса проверяем через getCourse (404 для чужих).
 */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const body = await parseJson(event, renderMarkdownBodySchema)

  const course = await useContentStore().getCourse(actor, body.course)
  if (!course) httpError(404, 'Курс не найден')

  // заголовки материалов курса — для текста [[вики-ссылок]]
  const linkTitles: Record<string, string> = {}
  for (const m of await useContentStore().listMaterials(actor, body.course)) {
    linkTitles[m.slug] = m.title
  }

  const attachments = body.material
    ? ((await useContentStore().getMaterial(actor, body.course, body.material))?.payload as DocPayload | undefined)?.attachments ?? []
    : []

  return renderDocMarkdown(body.content, {
    courseSlug: body.course,
    materialSlug: body.material ?? 'preview',
    linkTitles,
    attachments,
  })
})
