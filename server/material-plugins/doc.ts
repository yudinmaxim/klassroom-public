import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocPayload, ExternalLink } from '#shared/types'
import { defineMaterialPlugin } from '../ports/material-plugin'
import { renderDocMarkdown } from '../lib/md'
import { atomicWriteString, readString, readYaml, writeYaml } from '../lib/atomic'

/**
 * Плагин doc (первый, specs/04-плагины): md-страница с оглавлением,
 * картинками-вложениями и внутренними ссылками `[[slug]]`.
 *
 * Владение content/: doc.md (текст) + attachments/ (файлы материала).
 * Вложениями управляет ядро хранилища (upload/delete), рендером — плагин.
 */

const DOC_FILE = 'doc.md'
const LINKS_FILE = 'links.yml'
const ATTACHMENTS_DIR = 'attachments'

async function listAttachments(dir: string): Promise<string[]> {
  try {
    const files = await readdir(join(dir, ATTACHMENTS_DIR))
    return files.sort((a, b) => a.localeCompare(b, 'ru'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

export const docPlugin = defineMaterialPlugin({
  type: 'doc',
  title: 'Конспект (markdown)',

  io: {
    async write(dir, input) {
      const { content, links } = input as { content?: string, links?: ExternalLink[] }
      if (content !== undefined) await atomicWriteString(join(dir, DOC_FILE), content)
      if (links !== undefined) await writeYaml(join(dir, LINKS_FILE), links)
    },

    async read(dir) {
      const content = (await readString(join(dir, DOC_FILE))) ?? ''
      const links = (await readYaml<ExternalLink[]>(join(dir, LINKS_FILE))) ?? []
      return { content, attachments: await listAttachments(dir), links } satisfies DocPayload
    },
  },

  render(payload, ctx) {
    const { content, attachments } = payload as DocPayload
    return renderDocMarkdown(content, {
      courseSlug: ctx.courseSlug,
      materialSlug: ctx.materialSlug,
      attachments,
      trackEntity: ctx.trackEntity,
    })
  },
})

export { listAttachments, DOC_FILE, ATTACHMENTS_DIR }
