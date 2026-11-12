import type { RoleDef, Course, CourseSummary, GradingScale, Material, MaterialSummary, UserPublic } from '#shared/types'
import { readdir, rm, type Dirent } from 'node:fs/promises'
import { slugify } from '../lib/slug'
import { httpError } from '../lib/errors'
import { getMaterialPlugin } from '../material-plugins'
import { ATTACHMENTS_DIR, listAttachments } from '../material-plugins/doc'
import type { GitJournal } from '../lib/git-journal'
import {
  atomicDelete,
  atomicWriteBytes,
  ensureDir,
  readBytes,
  readYaml,
  resolveDataPath,
  writeYaml,
} from '../lib/atomic'
import type { ContentStore } from '../ports/content-store'
import type { RoleStore } from '../ports/role-store'

/**
 * Файловый адаптер порта ContentStore (specs/02-data-model.md):
 *
 *   content/courses/<slug>/
 *     course.yml   # title, description, teacher, gradingScale, createdAt
 *     roster.yml   # [username, ...]
 *     materials/   # (шаг 3), assignments/ (шаг 4)
 *
 * Каталог content/ — отдельный git-репозиторий; каждая мутация фиксируется
 * в журнале от лица актора (псевдоним).
 */

interface CourseFile {
  slug: string
  title: string
  description: string
  teacher: string
  gradingScale: GradingScale
  createdAt: string
}

interface RosterFile {
  students: string[]
}

interface MaterialFile {
  slug: string
  title: string
  type: string
  createdAt: string
  updatedAt: string
}

const DEFAULT_SCALE: GradingScale = { type: 'grade5' }

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase()
}

function courseDir(baseDir: string, slug: string): string {
  return resolveDataPath(baseDir, 'courses', slug)
}

function readCourse(baseDir: string, slug: string): Promise<CourseFile | null> {
  return readYaml<CourseFile>(resolveDataPath(courseDir(baseDir, slug), 'course.yml'))
}

async function readRoster(baseDir: string, slug: string): Promise<string[]> {
  const roster = await readYaml<RosterFile>(resolveDataPath(courseDir(baseDir, slug), 'roster.yml'))
  return roster?.students ?? []
}

function canSee(actor: UserPublic, role: RoleDef, course: CourseFile, roster: string[]): boolean {
  if (role.name === 'admin') return true
  if (!role.permissions.includes('courses.view')) return false
  if (role.scope === 'owner') return course.teacher === actor.username
  if (role.scope === 'member') return roster.includes(actor.username)
  return false
}

function canManage(actor: UserPublic, role: RoleDef, course: CourseFile): boolean {
  if (role.name === 'admin') return true
  if (!role.permissions.includes('courses.manage')) return false
  if (role.scope === 'owner') return course.teacher === actor.username
  return false
}

/** Чтение материалов: materials.view в пределах области роли. */
function canReadMaterial(actor: UserPublic, role: RoleDef, course: CourseFile, roster: string[]): boolean {
  if (role.name === 'admin') return true
  if (!role.permissions.includes('materials.view')) return false
  if (role.scope === 'owner') return course.teacher === actor.username
  if (role.scope === 'member') return roster.includes(actor.username)
  return false
}

/** Управление материалами: create/edit — только владелец курса или admin. */
function canWriteMaterial(actor: UserPublic, role: RoleDef, course: CourseFile, code: 'materials.create' | 'materials.edit'): boolean {
  if (role.name === 'admin') return true
  if (!role.permissions.includes(code)) return false
  if (role.scope === 'owner') return course.teacher === actor.username
  return false
}

function toCourse(f: CourseFile, students: string[]): Course {
  return {
    slug: f.slug,
    title: f.title,
    description: f.description,
    teacher: f.teacher,
    gradingScale: f.gradingScale,
    createdAt: f.createdAt,
    students,
  }
}

export function createFilesContentStore(baseDir: string, journal: GitJournal, roles: RoleStore): ContentStore {
  async function roleOf(actor: UserPublic): Promise<RoleDef> {
    const def = await roles.getRole(actor.role)
    if (!def) httpError(403, 'Роль аккаунта не найдена')
    return def
  }

  async function loadCourseFor(actor: UserPublic, slug: string): Promise<Course | null> {
    const f = await readCourse(baseDir, slug)
    if (!f) return null
    const roster = await readRoster(baseDir, slug)
    if (!canSee(actor, await roleOf(actor), f, roster)) return null
    return toCourse(f, roster)
  }

  async function loadForManage(actor: UserPublic, slug: string): Promise<CourseFile> {
    const f = await readCourse(baseDir, slug)
    if (!f) httpError(404, 'Курс не найден')
    if (!canManage(actor, await roleOf(actor), f)) httpError(403, 'Недостаточно прав')
    return f
  }

  async function writeCourse(f: CourseFile, roster: string[]): Promise<void> {
    await writeYaml(resolveDataPath(courseDir(baseDir, f.slug), 'course.yml'), {
      slug: f.slug,
      title: f.title,
      description: f.description,
      teacher: f.teacher,
      gradingScale: f.gradingScale,
      createdAt: f.createdAt,
    })
    await writeYaml(resolveDataPath(courseDir(baseDir, f.slug), 'roster.yml'), { students: roster })
  }

  // --- материалы (шаг 3) ---

  const MIME_BY_EXT: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    pdf: 'application/pdf',
    txt: 'text/plain; charset=utf-8',
    md: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    webm: 'video/webm',
    zip: 'application/zip',
  }
  /** Скачивание (Content-Disposition: attachment), не отдаём исполняемое. */
  const BLOCKED_EXT = new Set(['svg', 'html', 'htm', 'xhtml', 'js', 'mjs', 'exe', 'bat', 'cmd'])

  function mimeFor(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    return MIME_BY_EXT[ext] ?? 'application/octet-stream'
  }

  function materialsRoot(courseSlug: string): string {
    return resolveDataPath(courseDir(baseDir, courseSlug), 'materials')
  }

  function materialDir(courseSlug: string, materialSlug: string): string {
    return resolveDataPath(materialsRoot(courseSlug), materialSlug)
  }

  function readMaterial(courseSlug: string, materialSlug: string): Promise<MaterialFile | null> {
    return readYaml<MaterialFile>(resolveDataPath(materialDir(courseSlug, materialSlug), 'material.yml'))
  }

  function writeMaterial(courseSlug: string, f: MaterialFile): Promise<void> {
    return writeYaml(resolveDataPath(materialDir(courseSlug, f.slug), 'material.yml'), f)
  }

  /** Прочитать материал с проверкой права чтения (или 404/403). */
  async function loadMaterialForRead(actor: UserPublic, courseSlug: string, materialSlug: string): Promise<MaterialFile> {
    const course = await readCourse(baseDir, courseSlug)
    if (!course) httpError(404, 'Курс не найден')
    const roster = await readRoster(baseDir, courseSlug)
    const role = await roleOf(actor)
    if (!canReadMaterial(actor, role, course, roster)) httpError(404, 'Курс не найден')
    const f = await readMaterial(courseSlug, materialSlug)
    if (!f) httpError(404, 'Материал не найден')
    return f
  }

  /** Прочитать материал с проверкой права редактирования (или 404/403). */
  async function loadMaterialForManage(
    actor: UserPublic,
    courseSlug: string,
    materialSlug: string,
    code: 'materials.create' | 'materials.edit',
  ): Promise<MaterialFile> {
    const course = await readCourse(baseDir, courseSlug)
    if (!course) httpError(404, 'Курс не найден')
    const role = await roleOf(actor)
    if (!canWriteMaterial(actor, role, course, code)) httpError(403, 'Недостаточно прав')
    const f = await readMaterial(courseSlug, materialSlug)
    if (!f) httpError(404, 'Материал не найден')
    return f
  }

  /** Имя файла вложения: безопасный basename без опасных расширений. */
  function validateAttachmentName(name: string): string {
    const base = name.replaceAll('\\', '/').split('/').pop() ?? ''
    if (!base || base.startsWith('.') || base.length > 64) {
      httpError(400, 'Имя файла: до 64 символов, без точек в начале')
    }
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .()_+-]*$/u.test(base)) {
      httpError(400, 'Имя файла: буквы, цифры, пробел и . ( ) _ + -')
    }
    const ext = base.split('.').pop()?.toLowerCase() ?? ''
    if (BLOCKED_EXT.has(ext)) httpError(400, `Файлы «.${ext}» нельзя загружать`)
    return base
  }

  function toMaterial(f: MaterialFile, payload: unknown, html: string, toc: Material['toc']): Material {
    return {
      slug: f.slug,
      title: f.title,
      type: f.type,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      payload,
      html,
      toc,
    }
  }

  return {
    async listCourses(actor) {
      let slugs: Dirent[]
      try {
        slugs = await readdir(resolveDataPath(baseDir, 'courses'), { withFileTypes: true })
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw err
      }
      slugs = slugs.filter(d => d.isDirectory())

      const result: CourseSummary[] = []
      for (const dir of slugs) {
        const slug = dir.name
        const f = await readCourse(baseDir, slug)
        if (!f) continue
        const roster = await readRoster(baseDir, slug)
        if (!canSee(actor, await roleOf(actor), f, roster)) continue
        result.push({ slug: f.slug, title: f.title, teacher: f.teacher, studentCount: roster.length })
      }
      return result.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
    },

    async getCourse(actor, slug) {
      return loadCourseFor(actor, normalizeSlug(slug))
    },

    async createCourse(actor, input) {
      const role = await roleOf(actor)
      if (!role.permissions.includes('courses.create')) {
        httpError(403, 'Недостаточно прав для создания курса')
      }

      const slug = normalizeSlug(input.slug || slugify(input.title))
      if (await readCourse(baseDir, slug)) httpError(409, `Курс «${slug}» уже существует`)

      const course: CourseFile = {
        slug,
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        teacher: actor.username,
        gradingScale: input.gradingScale ?? DEFAULT_SCALE,
        createdAt: new Date().toISOString(),
      }
      await ensureDir(courseDir(baseDir, slug))
      await ensureDir(resolveDataPath(courseDir(baseDir, slug), 'materials'))
      await ensureDir(resolveDataPath(courseDir(baseDir, slug), 'assignments'))
      await writeCourse(course, [])

      journal.record(actor.pseudonym, `создал курс ${slug}`)
      return toCourse(course, [])
    },

    async updateCourse(actor, slug, patch) {
      const norm = normalizeSlug(slug)
      const f = await loadForManage(actor, norm)
      const changes: string[] = []
      if (patch.title !== undefined && patch.title !== f.title) {
        f.title = patch.title.trim()
        changes.push('переименовал курс')
      }
      if (patch.description !== undefined && patch.description !== f.description) {
        f.description = patch.description.trim()
        changes.push('обновил описание курса')
      }
      if (patch.gradingScale && JSON.stringify(patch.gradingScale) !== JSON.stringify(f.gradingScale)) {
        f.gradingScale = patch.gradingScale
        changes.push(`изменил шкалу оценивания (${f.gradingScale.type})`)
      }
      if (changes.length) {
        const roster = await readRoster(baseDir, norm)
        await writeCourse(f, roster)
        journal.record(actor.pseudonym, `${changes.join(', ')} ${norm}`)
      }
      return toCourse(f, await readRoster(baseDir, norm))
    },

    async addStudent(actor, slug, username) {
      const norm = normalizeSlug(slug)
      const f = await loadForManage(actor, norm)
      const roster = await readRoster(baseDir, norm)
      if (!roster.includes(username)) {
        roster.push(username)
        roster.sort()
        await writeCourse(f, roster)
        journal.record(actor.pseudonym, `зачислил ${username} в ${norm}`)
      }
      return toCourse(f, roster)
    },

    async removeStudent(actor, slug, username) {
      const norm = normalizeSlug(slug)
      const f = await loadForManage(actor, norm)
      const roster = await readRoster(baseDir, norm)
      const next = roster.filter(u => u !== username)
      if (next.length !== roster.length) {
        await writeCourse(f, next)
        journal.record(actor.pseudonym, `исключил ${username} из ${norm}`)
      }
      return toCourse(f, next)
    },

    // --- материалы ---

    async listMaterials(actor, courseSlug) {
      const norm = normalizeSlug(courseSlug)
      const course = await readCourse(baseDir, norm)
      if (!course) httpError(404, 'Курс не найден')
      const roster = await readRoster(baseDir, norm)
      if (!canReadMaterial(actor, await roleOf(actor), course, roster)) {
        httpError(404, 'Курс не найден')
      }

      let dirs: Dirent[]
      try {
        dirs = await readdir(materialsRoot(norm), { withFileTypes: true })
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw err
      }

      const result: MaterialSummary[] = []
      for (const d of dirs.filter(d => d.isDirectory())) {
        const f = await readMaterial(norm, d.name)
        if (f) result.push({ slug: f.slug, title: f.title, type: f.type, updatedAt: f.updatedAt })
      }
      return result.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
    },

    async getMaterial(actor, courseSlug, materialSlug) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadMaterialForRead(actor, norm, normalizeSlug(materialSlug))
      const plugin = getMaterialPlugin(f.type)
      if (!plugin) httpError(500, `Неизвестный тип материала «${f.type}»`)

      const dir = resolveDataPath(materialDir(norm, f.slug), 'content')
      const payload = await plugin.io.read(dir)
      const rendered = plugin.render(payload, { courseSlug: norm, materialSlug: f.slug })
      return toMaterial(f, payload, rendered.html, rendered.toc)
    },

    async createMaterial(actor, courseSlug, input) {
      const norm = normalizeSlug(courseSlug)
      const course = await readCourse(baseDir, norm)
      if (!course) httpError(404, 'Курс не найден')
      if (!canWriteMaterial(actor, await roleOf(actor), course, 'materials.create')) {
        httpError(403, 'Недостаточно прав')
      }

      const plugin = getMaterialPlugin(input.type)
      if (!plugin) httpError(400, `Неизвестный тип материала «${input.type}»`)

      const mslug = slugify(input.title)
      if (await readMaterial(norm, mslug)) httpError(409, `Материал «${mslug}» уже существует`)

      const now = new Date().toISOString()
      const f: MaterialFile = {
        slug: mslug,
        title: input.title.trim(),
        type: plugin.type,
        createdAt: now,
        updatedAt: now,
      }
      await ensureDir(resolveDataPath(materialDir(norm, mslug), 'content'))
      await writeMaterial(norm, f)
      await plugin.io.write(resolveDataPath(materialDir(norm, mslug), 'content'), { content: input.content })

      journal.record(actor.pseudonym, `создал материал ${mslug} в ${norm}`)
      return { slug: f.slug, title: f.title, type: f.type, updatedAt: f.updatedAt }
    },

    async updateMaterial(actor, courseSlug, materialSlug, patch) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadMaterialForManage(actor, norm, normalizeSlug(materialSlug), 'materials.edit')
      const plugin = getMaterialPlugin(f.type)
      if (!plugin) httpError(500, `Неизвестный тип материала «${f.type}»`)

      const changes: string[] = []
      if (patch.title !== undefined && patch.title.trim() !== f.title) {
        f.title = patch.title.trim()
        changes.push('переименовал')
      }
      if (patch.content !== undefined) {
        await plugin.io.write(resolveDataPath(materialDir(norm, f.slug), 'content'), { content: patch.content })
        changes.push('обновил содержимое')
      }
      if (changes.length) {
        f.updatedAt = new Date().toISOString()
        await writeMaterial(norm, f)
        journal.record(actor.pseudonym, `${changes.join(', ')} материал ${f.slug} в ${norm}`)
      }

      const dir = resolveDataPath(materialDir(norm, f.slug), 'content')
      const payload = await plugin.io.read(dir)
      const rendered = plugin.render(payload, { courseSlug: norm, materialSlug: f.slug })
      return toMaterial(f, payload, rendered.html, rendered.toc)
    },

    async deleteMaterial(actor, courseSlug, materialSlug) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadMaterialForManage(actor, norm, materialSlug, 'materials.edit')
      await rm(materialDir(norm, f.slug), { recursive: true, force: true })
      journal.record(actor.pseudonym, `удалил материал ${f.slug} из ${norm}`)
    },

    async addAttachment(actor, courseSlug, materialSlug, file) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadMaterialForManage(actor, norm, normalizeSlug(materialSlug), 'materials.edit')
      const name = validateAttachmentName(file.name)

      const dir = resolveDataPath(materialDir(norm, f.slug), 'content', ATTACHMENTS_DIR)
      const target = resolveDataPath(dir, name)
      const existing = await listAttachments(resolveDataPath(materialDir(norm, f.slug), 'content'))
      if (existing.includes(name)) httpError(409, `Файл «${name}» уже приложен — сначала удалите его`)

      await atomicWriteBytes(target, file.data)

      journal.record(actor.pseudonym, `приложил файл ${name} к материалу ${f.slug} в ${norm}`)
      return name
    },

    async removeAttachment(actor, courseSlug, materialSlug, name) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadMaterialForManage(actor, norm, normalizeSlug(materialSlug), 'materials.edit')
      const clean = validateAttachmentName(name)
      await atomicDelete(resolveDataPath(materialDir(norm, f.slug), 'content', ATTACHMENTS_DIR, clean))
      journal.record(actor.pseudonym, `удалил файл ${clean} из материала ${f.slug} в ${norm}`)
    },

    async getAttachment(actor, courseSlug, materialSlug, name) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadMaterialForRead(actor, norm, normalizeSlug(materialSlug))
      const clean = validateAttachmentName(name)
      const path = resolveDataPath(materialDir(norm, f.slug), 'content', ATTACHMENTS_DIR, clean)
      const data = await readBytes(path)
      return data ? { data, mime: mimeFor(clean) } : null
    },
  }
}
