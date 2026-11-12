import type { RoleDef, Course, CourseSummary, GradingScale, UserPublic } from '#shared/types'
import { readdir, type Dirent } from 'node:fs/promises'
import { slugify } from '../lib/slug'
import { httpError } from '../lib/errors'
import type { GitJournal } from '../lib/git-journal'
import {
  ensureDir,
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
        if (!canSee(actor, f, roster)) continue
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
  }
}
