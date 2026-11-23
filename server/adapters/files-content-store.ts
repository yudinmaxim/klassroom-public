import type { AssignmentSummary, ExternalLink, LinkStat, RoleDef, Course, CourseSummary, Gradebook, GradebookSection, GradingScale, Material, MaterialSummary, StreamFeedPost, StreamPost, Submission, SubmissionComment, SubmissionVersion, UserPublic } from '#shared/types'
import { renderDocMarkdown } from '../lib/md'
import { readdir, rename, rm, type Dirent } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { slugify } from '../lib/slug'
import { httpError } from '../lib/errors'
import { getMaterialPlugin } from '../material-plugins'
import { ATTACHMENTS_DIR, listAttachments } from '../material-plugins/doc'
import type { GitJournal } from '../lib/git-journal'
import {
  atomicDelete,
  atomicWriteBytes,
  atomicWriteString,
  ensureDir,
  readBytes,
  readString,
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
  /** Имя файла обложки в каталоге курса (cover.<ext>). */
  cover?: string
}

interface RosterFile {
  students: string[]
}

interface MaterialFile {
  /** Иммутабельный id = имя директории; slug — публичный, меняется при переименовании. */
  id: string
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
    cover: f.cover,
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
      ...(f.cover ? { cover: f.cover } : {}),
    })
    await writeYaml(resolveDataPath(courseDir(baseDir, f.slug), 'roster.yml'), { students: roster })
  }

  // --- индексация: id/slug, _index.yml, write-очередь (specs/10) ---

  /** Иммутабельный id сущности = имя её директории. */
  function newEntityId(): string {
    return randomBytes(8).toString('base64url')
  }

  interface CourseIndexFile {
    materials?: Record<string, string>
    assignments?: Record<string, string>
  }

  function indexPath(courseSlug: string): string {
    return resolveDataPath(courseDir(baseDir, courseSlug), '_index.yml')
  }

  function readCourseIndex(courseSlug: string): Promise<CourseIndexFile | null> {
    return readYaml<CourseIndexFile>(indexPath(courseSlug))
  }

  function writeCourseIndex(courseSlug: string, idx: CourseIndexFile): Promise<void> {
    return writeYaml(indexPath(courseSlug), idx)
  }

  /** Пересобрать _index.yml сканом сущностей курса (slug → id=имя директории). */
  async function refreshIndex(courseSlug: string): Promise<CourseIndexFile> {
    const idx: CourseIndexFile = { materials: {}, assignments: {} }
    for (const [kind, root] of [['materials', materialsRoot(courseSlug)], ['assignments', assignmentsRoot(courseSlug)]] as const) {
      let dirs: Dirent[]
      try {
        dirs = await readdir(root, { withFileTypes: true })
      } catch {
        continue
      }
      for (const d of dirs.filter(d => d.isDirectory())) {
        const f = kind === 'materials'
          ? await readMaterial(courseSlug, d.name)
          : await readAssignmentFile(courseSlug, d.name)
        if (f?.slug) idx[kind]![f.slug] = d.name
      }
    }
    await writeCourseIndex(courseSlug, idx)
    return idx
  }

  /** Резолв slug → id (имя директории). Промах индекса → пересборка и повтор. */
  async function resolveEntityDir(
    courseSlug: string,
    kind: 'materials' | 'assignments',
    ref: string,
  ): Promise<string | null> {
    const norm = normalizeSlug(ref)
    const idx = (await readCourseIndex(courseSlug)) ?? await refreshIndex(courseSlug)
    const hit = idx[kind]?.[norm]
    if (hit) return hit
    const fresh = await refreshIndex(courseSlug)
    return fresh[kind]?.[norm] ?? null
  }

  /** Свободный slug для сущности (коллизии → -2, -3…). selfId — свой id при переименовании. */
  async function uniqueSlug(courseSlug: string, kind: 'materials' | 'assignments', desired: string, selfId?: string): Promise<string> {
    let base = normalizeSlug(desired)
    if (!base || base.startsWith('course-')) base = `${kind}-${newEntityId().slice(0, 6)}`
    const idx = await refreshIndex(courseSlug)
    let candidate = base
    for (let i = 2; idx[kind]?.[candidate] && idx[kind]![candidate] !== selfId; i++) {
      candidate = `${base}-${i}`
    }
    return candidate
  }

  /** Per-course write-очередь: все мутации контента курса сериализуются (specs/10). */
  const locks = new Map<string, Promise<unknown>>()
  function withCourseLock<T>(courseSlug: string, fn: () => Promise<T>): Promise<T> {
    const key = `course:${normalizeSlug(courseSlug)}`
    const prev = locks.get(key) ?? Promise.resolve()
    const run = prev.then(fn, fn)
    locks.set(key, run.then(() => undefined, () => undefined))
    return run
  }

  // --- материалы (шаг 3) ---

  const MIME_BY_EXT: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
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

  /** Обложка курса — только растровые форматы (svg исключён: может нести скрипты). */
  const COVER_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'])
  const MAX_COVER_BYTES = 5 * 1024 * 1024

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

  async function readMaterial(courseSlug: string, dirId: string): Promise<MaterialFile | null> {
    const f = await readYaml<MaterialFile>(resolveDataPath(materialDir(courseSlug, dirId), 'material.yml'))
    if (f && !f.id) f.id = dirId // legacy-файлы без id: id = имя директории
    return f
  }

  function writeMaterial(courseSlug: string, f: MaterialFile): Promise<void> {
    return writeYaml(resolveDataPath(materialDir(courseSlug, f.id), 'material.yml'), f)
  }

  /** Прочитать материал с проверкой права чтения (или 404/403). */
  async function loadMaterialForRead(actor: UserPublic, courseSlug: string, materialSlug: string): Promise<MaterialFile> {
    const course = await readCourse(baseDir, courseSlug)
    if (!course) httpError(404, 'Курс не найден')
    const roster = await readRoster(baseDir, courseSlug)
    const role = await roleOf(actor)
    if (!canReadMaterial(actor, role, course, roster)) httpError(404, 'Курс не найден')
    const dirId = await resolveEntityDir(courseSlug, 'materials', materialSlug)
    if (!dirId) httpError(404, 'Материал не найден')
    const f = await readMaterial(courseSlug, dirId)
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
    const dirId = await resolveEntityDir(courseSlug, 'materials', materialSlug)
    if (!dirId) httpError(404, 'Материал не найден')
    const f = await readMaterial(courseSlug, dirId)
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
      id: f.id,
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

  /** Переписать [[oldSlug]] → [[newSlug]] в контенте всех материалов курса. */
  async function rewriteWikiLinks(courseSlug: string, oldSlug: string, newSlug: string): Promise<void> {
    let dirs: Dirent[]
    try {
      dirs = await readdir(materialsRoot(courseSlug), { withFileTypes: true })
    } catch {
      return
    }
    const escaped = oldSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`\\[\\[${escaped}\\]\\]`, 'gi')
    for (const d of dirs.filter(d => d.isDirectory())) {
      const f = await readMaterial(courseSlug, d.name)
      if (!f) continue
      const p = getMaterialPlugin(f.type)
      if (!p) continue
      const dir = resolveDataPath(materialDir(courseSlug, f.id), 'content')
      const payload = await p.io.read(dir) as { content?: unknown } | null
      if (!payload || typeof payload.content !== 'string') continue
      const next = payload.content.replace(pattern, `[[${newSlug}]]`)
      if (next !== payload.content) {
        await p.io.write(dir, { ...payload, content: next })
      }
    }
  }


  // --- задания (шаг 4) ---

  interface AssignmentFile {
    /** Иммутабельный id = имя директории; slug — публичный. */
    id: string
    slug: string
    title: string
    type: 'general' | 'private'
    audience: string[]
    status: 'draft' | 'published'
    due: string | null
    maxPoints: number | null
    createdAt: string
    updatedAt: string
    /** Пересдача разрешена по умолчанию (undefined = true для старых файлов). */
    allowResubmit?: boolean
    /** username → boolean: индивидуальное переопределение пересдачи. */
    resubmitOverrides?: Record<string, boolean>
    /** Блок внешних ссылок. */
    links?: ExternalLink[]
  }
  interface SubmissionFile {
    status: 'submitted' | 'returned'
    grade: number | null
    feedback: string
    submittedAt: string | null
    updatedAt: string | null
  }

  function assignmentsRoot(courseSlug: string): string {
    return resolveDataPath(courseDir(baseDir, courseSlug), 'assignments')
  }
  function assignmentDir(courseSlug: string, aid: string): string {
    return resolveDataPath(assignmentsRoot(courseSlug), aid)
  }
  function assignmentYmlPath(courseSlug: string, aid: string): string {
    return resolveDataPath(assignmentDir(courseSlug, aid), 'assignment.yml')
  }
  async function readAssignmentFile(courseSlug: string, aid: string): Promise<AssignmentFile | null> {
    const f = await readYaml<AssignmentFile>(assignmentYmlPath(courseSlug, aid))
    if (f && !f.id) f.id = aid // legacy-файлы без id: id = имя директории
    return f
  }
  function writeAssignmentFile(courseSlug: string, f: AssignmentFile): Promise<void> {
    return writeYaml(assignmentYmlPath(courseSlug, f.id), f)
  }
  function assignmentDescriptionPath(courseSlug: string, aid: string): string {
    return resolveDataPath(assignmentDir(courseSlug, aid), 'description.md')
  }
  function submissionsDir(courseSlug: string, aid: string): string {
    return resolveDataPath(assignmentDir(courseSlug, aid), 'submissions')
  }
  function submissionDir(courseSlug: string, aid: string, username: string): string {
    return resolveDataPath(submissionsDir(courseSlug, aid), username)
  }

  /** Учитель управляет заданиями курса; ученик — только по назначению. */
  function canManageAssignment(actor: UserPublic, role: RoleDef, course: CourseFile): boolean {
    if (role.name === 'admin') return true
    if (!role.permissions.includes('assignments.create')) return false
    if (role.scope === 'owner') return course.teacher === actor.username
    return false
  }

  /** Ученик видит задание: выдано + (общее или он в audience). */
  function canSeeAssignment(actor: UserPublic, role: RoleDef, course: CourseFile, roster: string[], f: AssignmentFile): boolean {
    if (role.name === 'admin') return true
    if (role.scope === 'owner') return course.teacher === actor.username
    if (!role.permissions.includes('assignments.view')) return false
    if (role.scope !== 'member' || !roster.includes(actor.username)) return false
    if (f.status !== 'published') return false
    return f.type === 'general' || f.audience.includes(actor.username)
  }

  /** Ученику можно сдавать: то же, что видеть + submissions.create. */
  function canSubmit(actor: UserPublic, role: RoleDef, course: CourseFile, roster: string[], f: AssignmentFile): boolean {
    return canSeeAssignment(actor, role, course, roster, f)
      && role.permissions.includes('submissions.create')
  }

  /** Эффективное правило пересдачи: индивидуальное переопределение > общий флаг (default true). */
  function resubmitAllowedFor(f: AssignmentFile, username: string): boolean {
    return f.resubmitOverrides?.[username] ?? f.allowResubmit ?? true
  }

  /** Учитель проверяет сдачи. */
  function canGrade(actor: UserPublic, role: RoleDef, course: CourseFile): boolean {
    if (role.name === 'admin') return true
    if (!role.permissions.includes('submissions.grade')) return false
    if (role.scope === 'owner') return course.teacher === actor.username
    return false
  }

  async function readSubmissionFile(courseSlug: string, aid: string, username: string): Promise<SubmissionFile | null> {
    return readYaml<SubmissionFile>(resolveDataPath(submissionDir(courseSlug, aid, username), 'submission.yml'))
  }
  function writeSubmissionFile(courseSlug: string, aid: string, username: string, f: SubmissionFile): Promise<void> {
    return writeYaml(resolveDataPath(submissionDir(courseSlug, aid, username), 'submission.yml'), f)
  }
  function submissionAnswerPath(courseSlug: string, aid: string, username: string): string {
    return resolveDataPath(submissionDir(courseSlug, aid, username), 'answer.md')
  }

  // --- история версий сдачи: submissions/<user>/history/<ts>.{yml,md} ---
  function submissionHistoryDir(courseSlug: string, aid: string, username: string): string {
    return resolveDataPath(submissionDir(courseSlug, aid, username), 'history')
  }
  /** Имя файла версии из submittedAt (ISO → безопасное для ФС). */
  function historyBase(ts: string): string {
    return ts.replace(/[:.]/g, '-')
  }
  /** Заархивировать текущую версию сдачи перед перезаписью (вместе с вложениями). */
  async function archiveSubmission(courseSlug: string, aid: string, username: string, sub: SubmissionFile): Promise<void> {
    const hdir = submissionHistoryDir(courseSlug, aid, username)
    const base = historyBase(sub.submittedAt ?? sub.updatedAt ?? new Date().toISOString())
    // вложения текущей сдачи принадлежат этой версии — переносим в history/<base>/attachments/
    const names = await listSubmissionAttachmentNames(courseSlug, aid, username)
    if (names.length) {
      const hAtt = resolveDataPath(hdir, base, ATTACHMENTS_DIR)
      const curAtt = submissionAttachmentsDir(courseSlug, aid, username)
      await ensureDir(hAtt)
      for (const n of names) {
        await rename(resolveDataPath(curAtt, n), resolveDataPath(hAtt, n))
      }
    }
    await ensureDir(hdir)
    await writeYaml(resolveDataPath(hdir, `${base}.yml`), {
      status: sub.status,
      grade: sub.grade,
      feedback: sub.feedback,
      submittedAt: sub.submittedAt,
      updatedAt: sub.updatedAt,
      ...(names.length ? { attachments: names } : {}),
    })
    const answer = await readString(submissionAnswerPath(courseSlug, aid, username))
    if (answer) await atomicWriteString(resolveDataPath(hdir, `${base}.md`), answer)
  }
  /** Прочитать историю версий (старые → новые). */
  async function readSubmissionHistory(courseSlug: string, aid: string, username: string): Promise<SubmissionVersion[]> {
    const hdir = submissionHistoryDir(courseSlug, aid, username)
    let files: string[]
    try {
      files = (await readdir(hdir)).filter(f => f.endsWith('.yml'))
    } catch {
      return []
    }
    const result: SubmissionVersion[] = []
    for (const file of files) {
      const meta = await readYaml<{ submittedAt: string | null, grade: number | null, feedback: string, attachments?: string[] }>(resolveDataPath(hdir, file))
      if (!meta) continue
      const base = file.replace(/\.yml$/, '')
      const answer = (await readString(resolveDataPath(hdir, `${base}.md`))) ?? ''
      result.push({
        file: base,
        submittedAt: meta.submittedAt ?? '',
        grade: meta.grade,
        feedback: meta.feedback,
        answer,
        html: renderDocMarkdown(answer, {
          courseSlug,
          materialSlug: 'answers',
          linkTitles: {},
          attachments: meta.attachments ?? [],
          attachmentUrlFor: (name) =>
            `/api/courses/${courseSlug}/assignments/${aid}/submissions/${username}/history/${file}/attachments/${encodeURIComponent(name)}`,
          trackEntity: `sub:${aid}:${username}`,
        }).html,
        attachments: meta.attachments ?? [],
      })
    }
    return result.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  }

  /** Время последнего комментария в треде сдачи (или null). */
  async function latestSubmissionCommentAt(courseSlug: string, aid: string, username: string): Promise<string | null> {
    const dir = submissionCommentsDir(courseSlug, aid, username)
    let files: string[]
    try {
      files = (await readdir(dir)).filter(f => f.endsWith('.yml'))
    } catch {
      return null
    }
    let max: string | null = null
    for (const file of files) {
      const c = await readYaml<{ createdAt?: string }>(resolveDataPath(dir, file))
      if (c?.createdAt && (!max || c.createdAt > max)) max = c.createdAt
    }
    return max
  }

  async function listSubmissionUsers(courseSlug: string, aid: string): Promise<string[]> {
    try {
      const dirs = await readdir(submissionsDir(courseSlug, aid), { withFileTypes: true })
      // считаем только директории с submission.yml — attachments/comments
      // могут существовать до первой сдачи
      const users: string[] = []
      for (const d of dirs.filter(d => d.isDirectory())) {
        if (await readSubmissionFile(courseSlug, aid, d.name)) users.push(d.name)
      }
      return users.sort()
    } catch {
      return []
    }
  }

  async function loadAssignmentForManage(actor: UserPublic, courseSlug: string, aid: string): Promise<AssignmentFile> {
    const norm = normalizeSlug(courseSlug)
    const course = await readCourse(baseDir, norm)
    if (!course) httpError(404, 'Курс не найден')
    const role = await roleOf(actor)
    if (!canManageAssignment(actor, role, course)) httpError(403, 'Недостаточно прав')
    const dirId = await resolveEntityDir(norm, 'assignments', aid)
    if (!dirId) httpError(404, 'Задание не найдено')
    const f = await readAssignmentFile(norm, dirId)
    if (!f) httpError(404, 'Задание не найдено')
    return f
  }

  async function loadAssignmentForActor(
    actor: UserPublic,
    courseSlug: string,
    aid: string,
    need: 'view' | 'submit',
  ): Promise<{ course: CourseFile, f: AssignmentFile, role: RoleDef, roster: string[] }> {
    const norm = normalizeSlug(courseSlug)
    const course = await readCourse(baseDir, norm)
    if (!course) httpError(404, 'Курс не найден')
    const roster = await readRoster(baseDir, norm)
    const role = await roleOf(actor)
    const dirId = await resolveEntityDir(norm, 'assignments', aid)
    if (!dirId) httpError(404, 'Задание не найдено')
    const f = await readAssignmentFile(norm, dirId)
    if (!f) httpError(404, 'Задание не найдено')
    const ok = need === 'submit'
      ? canSubmit(actor, role, course, roster, f)
      : canSeeAssignment(actor, role, course, roster, f) || canManageAssignment(actor, role, course)
    if (!ok) httpError(404, 'Задание не найдено')
    return { course, f, role, roster }
  }

  function toAssignmentSummary(f: AssignmentFile, submissionCount: number, myStatus?: AssignmentSummary['myStatus']): AssignmentSummary {
    return { slug: f.slug, title: f.title, type: f.type, status: f.status, due: f.due, submissionCount, myStatus, updatedAt: f.updatedAt }
  }

  // --- тред комментариев и вложения сдачи: submissions/<user>/{comments,attachments} ---
  function submissionAttachmentsDir(courseSlug: string, aid: string, username: string): string {
    return resolveDataPath(submissionDir(courseSlug, aid, username), 'attachments')
  }
  function submissionCommentsDir(courseSlug: string, aid: string, username: string): string {
    return resolveDataPath(submissionDir(courseSlug, aid, username), 'comments')
  }
  async function listSubmissionAttachmentNames(courseSlug: string, aid: string, username: string): Promise<string[]> {
    try {
      return await listAttachments(submissionDir(courseSlug, aid, username))
    } catch {
      return []
    }
  }
  /** Все имена вложений сдачи: текущие + заархивированные в history/ (для ссылок в тексте ответа). */
  async function listAllSubmissionAttachmentNames(courseSlug: string, aid: string, username: string): Promise<string[]> {
    const names = new Set(await listSubmissionAttachmentNames(courseSlug, aid, username))
    try {
      const hdir = submissionHistoryDir(courseSlug, aid, username)
      for (const d of await readdir(hdir, { withFileTypes: true })) {
        if (d.isDirectory()) {
          for (const n of await listAttachments(resolveDataPath(hdir, d.name))) names.add(n)
        }
      }
    } catch { /* истории нет */ }
    return [...names]
  }
  // --- трекинг внешних ссылок: link-clicks/<kind>/<id>/<hash>.yml ---
  function linkClicksDir(courseSlug: string, entity: string): string {
    // entity: 'topic:<id>' | 'assign:<id>' | 'sub:<aid>:<user>' → topic/<id> и т.д.
    return resolveDataPath(courseDir(baseDir, courseSlug), 'link-clicks', ...entity.split(':'))
  }
  function linkHash(url: string): string {
    return createHash('sha1').update(url).digest('hex').slice(0, 16)
  }
  interface LinkClickFile {
    url: string
    users: Record<string, { count: number, firstAt: string, lastAt: string }>
  }
  /** Сущность из entity-ключа существует и доступна actor (мягкая проверка для записи). */
  async function linkEntityExists(actor: UserPublic, norm: string, entity: string): Promise<boolean> {
    const course = await readCourse(baseDir, norm)
    if (!course) return false
    const role = await roleOf(actor)
    const roster = await readRoster(baseDir, norm)
    if (!canSee(actor, role, course, roster)) return false
    const [kind, a] = entity.split(':')
    if (kind === 'topic' && a) return !!(await readMaterial(norm, a))
    if ((kind === 'assign' || kind === 'sub') && a) return !!(await readAssignmentFile(norm, a))
    return false
  }
  /** Право смотреть статистику: тема — materials.edit, задание/сдача — управления заданиями. */
  async function canSeeLinkStats(actor: UserPublic, norm: string, entity: string): Promise<boolean> {
    const course = await readCourse(baseDir, norm)
    if (!course) return false
    const role = await roleOf(actor)
    const [kind, a] = entity.split(':')
    if (kind === 'topic' && a) {
      const f = await readMaterial(norm, a)
      return !!f && canWriteMaterial(actor, role, course, 'materials.edit')
    }
    if ((kind === 'assign' || kind === 'sub') && a) {
      const f = await readAssignmentFile(norm, a)
      return !!f && canManageAssignment(actor, role, course)
    }
    return false
  }

  /**
   * Доступ к треду сдачи: проверяющий (canGrade/view.all) — любому ученику,
   * ученик — только к своей сдаче и только если может сдавать (выдано).
   */
  async function loadSubmissionAccess(
    actor: UserPublic,
    courseSlug: string,
    aid: string,
    username: string,
  ): Promise<{ course: CourseFile, f: AssignmentFile }> {
    const norm = normalizeSlug(courseSlug)
    const course = await readCourse(baseDir, norm)
    if (!course) httpError(404, 'Курс не найден')
    const role = await roleOf(actor)
    const isGrader = canGrade(actor, role, course)
      || (role.scope === 'owner' && role.permissions.includes('submissions.view.all'))
    if (isGrader) {
      const dirId = await resolveEntityDir(norm, 'assignments', aid)
      if (!dirId) httpError(404, 'Задание не найдено')
      const f = await readAssignmentFile(norm, dirId)
      if (!f) httpError(404, 'Задание не найдено')
      return { course, f }
    }
    if (actor.username !== username) httpError(404, 'Сдача не найдена')
    const { f } = await loadAssignmentForActor(actor, norm, aid, 'submit')
    return { course, f }
  }
  // --- лента курса: courses/<slug>/stream/<pid>.yml ---
  function streamDir(courseSlug: string): string {
    return resolveDataPath(courseDir(baseDir, courseSlug), 'stream')
  }
  function streamCommentsDir(courseSlug: string, postId: string): string {
    return resolveDataPath(streamDir(courseSlug), postId, 'comments')
  }
  /** Участник курса (или null → 404): читаемость = canSee. */
  async function requireCourseMember(actor: UserPublic, courseSlug: string): Promise<CourseFile> {
    const norm = normalizeSlug(courseSlug)
    const course = await loadCourseFor(actor, norm)
    if (!course) httpError(404, 'Курс не найден')
    // loadCourseFor вернул Course — для записи stream достаточно dir по slug
    const f = await readCourse(baseDir, norm)
    if (!f) httpError(404, 'Курс не найден')
    return f
  }

  /** Submission + answer.md + список вложений. */
  async function submissionView(courseSlug: string, aid: string, username: string, sub: SubmissionFile): Promise<Submission> {
    const answer = (await readString(submissionAnswerPath(courseSlug, aid, username))) ?? ''
    const attachments = await listSubmissionAttachmentNames(courseSlug, aid, username)
    const answerAttachments = await listAllSubmissionAttachmentNames(courseSlug, aid, username)
    return {
      username, status: sub.status, grade: sub.grade, feedback: sub.feedback,
      answer,
      html: renderDocMarkdown(answer, {
        courseSlug,
        materialSlug: 'answers',
        linkTitles: {},
        attachments: answerAttachments,
        attachmentUrlFor: (name) =>
          `/api/courses/${courseSlug}/assignments/${aid}/submissions/${username}/attachments/${encodeURIComponent(name)}`,
        trackEntity: `sub:${aid}:${username}`,
      }).html,
      submittedAt: sub.submittedAt, updatedAt: sub.updatedAt, attachments,
    }
  }

  /** Курсы, видимые actor (slug+title) — для глобальных ленты/журнала. */
  async function visibleCourses(actor: UserPublic): Promise<{ slug: string, title: string }[]> {
    let slugs: Dirent[]
    try {
      slugs = await readdir(resolveDataPath(baseDir, 'courses'), { withFileTypes: true })
    } catch {
      return []
    }
    const result: { slug: string, title: string }[] = []
    for (const dir of slugs.filter(d => d.isDirectory())) {
      const f = await readCourse(baseDir, dir.name)
      if (!f) continue
      const roster = await readRoster(baseDir, dir.name)
      if (!canSee(actor, await roleOf(actor), f, roster)) continue
      result.push({ slug: f.slug, title: f.title })
    }
    return result
  }

  /** Журнал оценок курса (общий код для getGradebook/listGradebooks). */
  async function buildGradebook(actor: UserPublic, norm: string): Promise<Gradebook> {
    const course = await loadCourseFor(actor, norm)
    if (!course) httpError(404, 'Курс не найден')
    const courseFile = await readCourse(baseDir, norm)
    if (!courseFile) httpError(404, 'Курс не найден')
    const roster = await readRoster(baseDir, norm)
    const role = await roleOf(actor)
    // полный журнал — учитель/админ (canGrade); ученику — только своя строка
    const canSeeAll = canGrade(actor, role, courseFile)
    const students = canSeeAll ? roster : roster.filter(u => u === actor.username)

    // колонки: только опубликованные задания, по createdAt
    let dirs: Dirent[]
    try {
      dirs = await readdir(assignmentsRoot(norm), { withFileTypes: true })
    } catch {
      dirs = []
    }
    const cols: { slug: string, id: string, title: string, due: string | null, createdAt: string, file: AssignmentFile }[] = []
    for (const d of dirs.filter(d => d.isDirectory())) {
      const f = await readAssignmentFile(norm, d.name)
      if (!f || f.status !== 'published') continue
      cols.push({ slug: f.slug, id: f.id, title: f.title, due: f.due, createdAt: f.createdAt, file: f })
    }
    cols.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    const rows: Gradebook['rows'] = []
    for (const username of students) {
      const cells: Gradebook['rows'][number]['cells'] = []
      for (const col of cols) {
        // ученик видит в журнале только задания, доступные ему
        const visible = canSeeAll
          || (role.scope === 'member' && canSeeAssignment(actor, role, courseFile, roster, col.file))
        if (!visible) {
          cells.push({ assignmentSlug: col.slug, assignmentId: col.id, status: 'none', grade: null, maxPoints: col.file.maxPoints, submittedAt: null, updatedAt: null })
          continue
        }
        const sub = await readSubmissionFile(norm, col.id, username)
        cells.push({
          assignmentSlug: col.slug,
          assignmentId: col.id,
          status: sub ? sub.status : 'none',
          grade: sub?.grade ?? null,
          maxPoints: col.file.maxPoints,
          submittedAt: sub?.submittedAt ?? null,
          updatedAt: sub?.updatedAt ?? null,
        })
      }
      rows.push({ student: username, mine: username === actor.username, cells })
    }

    return {
      assignments: cols.map(c => ({ slug: c.slug, id: c.id, title: c.title, due: c.due })),
      rows,
      canSeeAll,
    }
  }

  const impl: ContentStore = {
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
        result.push({
          slug: f.slug,
          title: f.title,
          teacher: f.teacher,
          studentCount: roster.length,
          cover: f.cover,
        })
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

    async deleteCourse(actor, slug) {
      const norm = normalizeSlug(slug)
      const f = await loadForManage(actor, norm)
      await rm(courseDir(baseDir, norm), { recursive: true, force: true })
      journal.record(actor.pseudonym, `удалил курс ${norm} «${f.title}»`)
    },

    // --- обложка курса: один файл cover.<ext> в каталоге курса ---

    async setCourseCover(actor, slug, file) {
      const norm = normalizeSlug(slug)
      const f = await loadForManage(actor, norm)
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!COVER_EXTS.has(ext)) {
        httpError(400, 'Обложка: только png, jpg, gif, webp, avif или bmp')
      }
      if (!file.data.length) httpError(400, 'Файл пустой')
      if (file.data.length > MAX_COVER_BYTES) httpError(400, 'Обложка больше 5 МБ')

      if (f.cover) await atomicDelete(resolveDataPath(courseDir(baseDir, norm), f.cover))
      const name = `cover.${ext}`
      await atomicWriteBytes(resolveDataPath(courseDir(baseDir, norm), name), file.data)
      f.cover = name

      const roster = await readRoster(baseDir, norm)
      await writeCourse(f, roster)
      journal.record(actor.pseudonym, `обновил обложку курса ${norm}`)
      return name
    },

    async removeCourseCover(actor, slug) {
      const norm = normalizeSlug(slug)
      const f = await loadForManage(actor, norm)
      if (!f.cover) return
      await atomicDelete(resolveDataPath(courseDir(baseDir, norm), f.cover))
      delete f.cover
      const roster = await readRoster(baseDir, norm)
      await writeCourse(f, roster)
      journal.record(actor.pseudonym, `убрал обложку курса ${norm}`)
    },

    async getCourseCover(actor, slug) {
      const norm = normalizeSlug(slug)
      const course = await loadCourseFor(actor, norm)
      if (!course?.cover) return null
      const data = await readBytes(resolveDataPath(courseDir(baseDir, norm), course.cover))
      return data ? { data, mime: mimeFor(course.cover) } : null
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

      const dir = resolveDataPath(materialDir(norm, f.id), 'content')
      const payload = await plugin.io.read(dir)
      const rendered = plugin.render(payload, { courseSlug: norm, materialSlug: f.slug, trackEntity: `topic:${f.id}` })
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

      const dirId = newEntityId()
      const mslug = await uniqueSlug(norm, 'materials', slugify(input.title))

      const now = new Date().toISOString()
      const f: MaterialFile = {
        id: dirId,
        slug: mslug,
        title: input.title.trim(),
        type: plugin.type,
        createdAt: now,
        updatedAt: now,
      }
      await ensureDir(resolveDataPath(materialDir(norm, dirId), 'content'))
      await writeMaterial(norm, f)
      await plugin.io.write(resolveDataPath(materialDir(norm, dirId), 'content'), { content: input.content, links: input.links ?? [] })
      await refreshIndex(norm)

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
        const oldSlug = f.slug
        f.title = patch.title.trim()

        // slug следует за названием и живёт только в yml + _index.yml —
        // директория (id) не трогается, rename() не нужен (specs/10).
        const wanted = slugify(f.title)
        if (wanted !== oldSlug && !wanted.startsWith('course-')) {
          const candidate = await uniqueSlug(norm, 'materials', wanted, f.id)
          if (candidate !== oldSlug) {
            f.slug = candidate
            await rewriteWikiLinks(norm, oldSlug, candidate)
            changes.push(`переименовал (${oldSlug} → ${candidate})`)
          } else {
            changes.push('переименовал')
          }
        } else {
          changes.push('переименовал')
        }
      }
      if (patch.content !== undefined || patch.links !== undefined) {
        const contentDir = resolveDataPath(materialDir(norm, f.id), 'content')
        if (patch.links !== undefined && patch.content === undefined) {
          // links-only: io.write пишет лишь переданные поля — doc.md не трогаем
          await plugin.io.write(contentDir, { links: patch.links })
        } else {
          await plugin.io.write(contentDir, { content: patch.content ?? '', links: patch.links })
        }
        if (patch.content !== undefined) changes.push('обновил содержимое')
        if (patch.links !== undefined) changes.push('обновил ссылки')
      }
      if (changes.length) {
        f.updatedAt = new Date().toISOString()
        await writeMaterial(norm, f)
        await refreshIndex(norm)
        journal.record(actor.pseudonym, `${changes.join(', ')} материал ${f.slug} в ${norm}`)
      }

      const dir = resolveDataPath(materialDir(norm, f.id), 'content')
      const payload = await plugin.io.read(dir)
      const rendered = plugin.render(payload, { courseSlug: norm, materialSlug: f.slug, trackEntity: `topic:${f.id}` })
      return toMaterial(f, payload, rendered.html, rendered.toc)
    },

    async deleteMaterial(actor, courseSlug, materialSlug) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadMaterialForManage(actor, norm, materialSlug, 'materials.edit')
      await rm(materialDir(norm, f.id), { recursive: true, force: true })
      await refreshIndex(norm)
      journal.record(actor.pseudonym, `удалил материал ${f.slug} из ${norm}`)
    },

    async addAttachment(actor, courseSlug, materialSlug, file) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadMaterialForManage(actor, norm, normalizeSlug(materialSlug), 'materials.edit')
      const name = validateAttachmentName(file.name)

      const dir = resolveDataPath(materialDir(norm, f.id), 'content', ATTACHMENTS_DIR)
      const target = resolveDataPath(dir, name)
      const existing = await listAttachments(resolveDataPath(materialDir(norm, f.id), 'content'))
      if (existing.includes(name)) httpError(409, `Файл «${name}» уже приложен — сначала удалите его`)

      await atomicWriteBytes(target, file.data)

      journal.record(actor.pseudonym, `приложил файл ${name} к материалу ${f.slug} в ${norm}`)
      return name
    },

    async removeAttachment(actor, courseSlug, materialSlug, name) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadMaterialForManage(actor, norm, normalizeSlug(materialSlug), 'materials.edit')
      const clean = validateAttachmentName(name)
      await atomicDelete(resolveDataPath(materialDir(norm, f.id), 'content', ATTACHMENTS_DIR, clean))
      journal.record(actor.pseudonym, `удалил файл ${clean} из материала ${f.slug} в ${norm}`)
    },

    async getAttachment(actor, courseSlug, materialSlug, name) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadMaterialForRead(actor, norm, normalizeSlug(materialSlug))
      const clean = validateAttachmentName(name)
      const path = resolveDataPath(materialDir(norm, f.id), 'content', ATTACHMENTS_DIR, clean)
      const data = await readBytes(path)
      return data ? { data, mime: mimeFor(clean) } : null
    },
    // --- задания ---

    async listAssignments(actor, courseSlug) {
      const norm = normalizeSlug(courseSlug)
      const course = await readCourse(baseDir, norm)
      if (!course) httpError(404, 'Курс не найден')
      const roster = await readRoster(baseDir, norm)
      const role = await roleOf(actor)
      const manager = canManageAssignment(actor, role, course)

      let dirs: Dirent[]
      try {
        dirs = await readdir(assignmentsRoot(norm), { withFileTypes: true })
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw err
      }

      const result: AssignmentSummary[] = []
      for (const d of dirs.filter(d => d.isDirectory())) {
        const f = await readAssignmentFile(norm, d.name)
        if (!f) continue
        if (!manager && !canSeeAssignment(actor, role, course, roster, f)) continue
        const users = await listSubmissionUsers(norm, f.id)
        let myStatus: AssignmentSummary['myStatus']
        let mine: SubmissionFile | null = null
        if (!manager && role.scope === 'member') {
          mine = await readSubmissionFile(norm, f.id, actor.username)
          myStatus = mine ? mine.status : 'none'
        }
        const summary = toAssignmentSummary(f, users.length, myStatus)
        if (mine) {
          // индикации для ученика: оценка + время последнего комментария
          summary.myGrade = mine.grade
          summary.myLastCommentAt = await latestSubmissionCommentAt(norm, f.id, actor.username)
        }
        result.push(summary)
      }
      return result.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    },

    async getAssignment(actor, courseSlug, assignmentSlug) {
      const norm = normalizeSlug(courseSlug)
      const { course, f, role } = await loadAssignmentForActor(actor, norm, assignmentSlug, 'view')
      const rawDescription = (await readString(assignmentDescriptionPath(norm, f.id))) ?? ''
      // лидирующий H1, дублирующий название задания, на странице не нужен
      const escTitle = f.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const description = rawDescription.replace(new RegExp(`^\\s*#\\s+${escTitle}[ \\t]*\\n?`, 'i'), '')
      const { renderDocMarkdown } = await import('../lib/md')
      const linkTitles: Record<string, string> = {}
      try {
        for (const d of await readdir(materialsRoot(norm), { withFileTypes: true })) {
          if (!d.isDirectory()) continue
          const m = await readMaterial(norm, d.name)
          if (m) linkTitles[m.slug] = m.title
        }
      } catch { /* нет материалов — ок */ }
      const rendered = renderDocMarkdown(description, {
        courseSlug: norm,
        materialSlug: f.slug,
        linkTitles,
        attachments: [],
        trackEntity: `assign:${f.id}`,
      })
      const canManage = canManageAssignment(actor, role, course)
      return {
        id: f.id,
        slug: f.slug, title: f.title, type: f.type, audience: f.audience,
        status: f.status, due: f.due, maxPoints: f.maxPoints,
        createdAt: f.createdAt, updatedAt: f.updatedAt,
        description, html: rendered.html,
        allowResubmit: f.allowResubmit ?? true,
        resubmitOverrides: canManage ? (f.resubmitOverrides ?? {}) : {},
        canResubmit: resubmitAllowedFor(f, actor.username),
        links: f.links ?? [],
      }
    },

    async createAssignment(actor, courseSlug, input) {
      const norm = normalizeSlug(courseSlug)
      const course = await readCourse(baseDir, norm)
      if (!course) httpError(404, 'Курс не найден')
      const role = await roleOf(actor)
      if (!canManageAssignment(actor, role, course)) httpError(403, 'Недостаточно прав')

      const roster = await readRoster(baseDir, norm)
      if (input.type === 'private') {
        if (!input.audience?.length) httpError(400, 'Для частного задания выберите хотя бы одного ученика')
        const unknown = input.audience.filter(u => !roster.includes(u))
        if (unknown.length) httpError(400, `Не в составе курса: ${unknown.join(', ')}`)
      }

      const dirId = newEntityId()
      const now = new Date().toISOString()
      const f: AssignmentFile = {
        id: dirId,
        slug: await uniqueSlug(norm, 'assignments', slugify(input.title)),
        title: input.title.trim(),
        type: input.type,
        audience: input.type === 'private' ? [...new Set(input.audience ?? [])] : [],
        status: 'draft',
        due: input.due ?? null,
        maxPoints: input.maxPoints ?? null,
        createdAt: now,
        updatedAt: now,
        allowResubmit: input.allowResubmit ?? true,
        resubmitOverrides: {},
        links: input.links ?? [],
      }

      await ensureDir(assignmentDir(norm, dirId))
      await writeAssignmentFile(norm, f)
      await atomicWriteString(assignmentDescriptionPath(norm, dirId), input.description ?? '')
      await refreshIndex(norm)
      journal.record(actor.pseudonym, `создал задание ${f.slug} в ${norm}`)
      return toAssignmentSummary(f, 0)
    },

    async updateAssignment(actor, courseSlug, assignmentSlug, patch) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadAssignmentForManage(actor, norm, assignmentSlug)

      const changes: string[] = []
      if (patch.title !== undefined && patch.title.trim() !== f.title) {
        const oldSlug = f.slug
        f.title = patch.title.trim()
        // slug следует за названием — только yml + _index.yml, директория (id) не трогается
        const wanted = slugify(f.title)
        if (wanted !== oldSlug && !wanted.startsWith('course-')) {
          const candidate = await uniqueSlug(norm, 'assignments', wanted, f.id)
          if (candidate !== oldSlug) {
            f.slug = candidate
            changes.push(`переименовал (${oldSlug} → ${candidate})`)
          } else {
            changes.push('переименовал')
          }
        } else {
          changes.push('переименовал')
        }
      }
      if (patch.type !== undefined && patch.type !== f.type) {
        f.type = patch.type
        changes.push('сменил тип')
      }
      if (patch.audience !== undefined) {
        f.audience = patch.type === 'private' || f.type === 'private' ? [...new Set(patch.audience)] : []
        changes.push('обновил состав')
      }
      if (patch.due !== undefined && patch.due !== f.due) {
        f.due = patch.due
        changes.push('обновил дедлайн')
      }
      if (patch.maxPoints !== undefined && patch.maxPoints !== f.maxPoints) {
        f.maxPoints = patch.maxPoints
        changes.push('обновил баллы')
      }
      if (patch.allowResubmit !== undefined && patch.allowResubmit !== (f.allowResubmit ?? true)) {
        f.allowResubmit = patch.allowResubmit
        changes.push(patch.allowResubmit ? 'разрешил пересдачу' : 'запретил пересдачу')
      }
      if (patch.links !== undefined) {
        f.links = patch.links
        changes.push('обновил ссылки')
      }
      if (patch.status !== undefined && patch.status !== f.status) {
        f.status = patch.status
        changes.push(patch.status === 'published' ? 'выдал задание' : 'снял с выдачи')
      }
      if (patch.description !== undefined) {
        await atomicWriteString(assignmentDescriptionPath(norm, f.id), patch.description)
        changes.push('обновил описание')
      }
      // инвариант: частное задание всегда имеет хотя бы одного ученика
      if (f.type === 'private' && !f.audience.length) {
        httpError(400, 'Для частного задания нужен хотя бы один ученик')
      }
      if (changes.length) {
        f.updatedAt = new Date().toISOString()
        await writeAssignmentFile(norm, f)
        await refreshIndex(norm)
        journal.record(actor.pseudonym, `${changes.join(', ')} задание ${f.slug} в ${norm}`)
      }

      return impl.getAssignment(actor, norm, f.slug)
    },

    async deleteAssignment(actor, courseSlug, assignmentSlug) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadAssignmentForManage(actor, norm, assignmentSlug)
      await rm(assignmentDir(norm, f.id), { recursive: true, force: true })
      await refreshIndex(norm)
      journal.record(actor.pseudonym, `удалил задание ${f.slug} из ${norm}`)
    },

    async submitAssignment(actor, courseSlug, assignmentSlug, answer) {
      const norm = normalizeSlug(courseSlug)
      const { f } = await loadAssignmentForActor(actor, norm, assignmentSlug, 'submit')
      const now = new Date().toISOString()
      const existing = await readSubmissionFile(norm, f.id, actor.username)
      if (existing && !resubmitAllowedFor(f, actor.username)) {
        httpError(403, 'Пересдача по этому заданию запрещена')
      }
      // пересдача — текущую версию уносим в history/ до перезаписи
      if (existing) await archiveSubmission(norm, f.id, actor.username, existing)
      const sub: SubmissionFile = {
        status: 'submitted',
        // оценка и комментарий относятся к конкретной версии ответа —
        // при пересдаче сбрасываются (старая версия уже в history/)
        grade: null,
        feedback: '',
        submittedAt: now,
        updatedAt: now,
      }
      await ensureDir(submissionDir(norm, f.id, actor.username))
      await writeSubmissionFile(norm, f.id, actor.username, sub)
      await atomicWriteString(submissionAnswerPath(norm, f.id, actor.username), answer)
      journal.record(actor.pseudonym, `сдал задание ${f.slug} в ${norm}`)
      return submissionView(norm, f.id, actor.username, sub)
    },

    async setResubmitOverride(actor, courseSlug, assignmentSlug, username, allowed) {
      const norm = normalizeSlug(courseSlug)
      const f = await loadAssignmentForManage(actor, norm, assignmentSlug)
      const roster = await readRoster(baseDir, norm)
      if (!roster.includes(username)) httpError(400, `Не в составе курса: ${username}`)
      const overrides = { ...(f.resubmitOverrides ?? {}) }
      if (allowed === null) {
        const { [username]: _removed, ...rest } = overrides
        f.resubmitOverrides = Object.keys(rest).length ? rest : undefined
      } else {
        overrides[username] = allowed
        f.resubmitOverrides = overrides
      }
      f.updatedAt = new Date().toISOString()
      await writeAssignmentFile(norm, f)
      await refreshIndex(norm)
      journal.record(actor.pseudonym, `${allowed === null ? 'сбросил' : allowed ? 'разрешил' : 'запретил'} пересдачу ${f.slug} для ${username} в ${norm}`)
      return impl.getAssignment(actor, norm, f.slug)
    },

    async getOwnSubmission(actor, courseSlug, assignmentSlug) {
      const norm = normalizeSlug(courseSlug)
      const { f } = await loadAssignmentForActor(actor, norm, assignmentSlug, 'submit')
      const sub = await readSubmissionFile(norm, f.id, actor.username)
      if (!sub) return null
      return submissionView(norm, f.id, actor.username, sub)
    },

    async listSubmissions(actor, courseSlug, assignmentSlug) {
      const norm = normalizeSlug(courseSlug)
      const course = await readCourse(baseDir, norm)
      if (!course) httpError(404, 'Курс не найден')
      const role = await roleOf(actor)
      if (!canGrade(actor, role, course) && !(role.scope === 'owner' && role.permissions.includes('submissions.view.all'))) {
        httpError(403, 'Недостаточно прав')
      }
      const dirId = await resolveEntityDir(norm, 'assignments', assignmentSlug)
      if (!dirId) httpError(404, 'Задание не найдено')
      const f = await readAssignmentFile(norm, dirId)
      if (!f) httpError(404, 'Задание не найдено')

      const result: Submission[] = []
      for (const username of await listSubmissionUsers(norm, f.id)) {
        const sub = await readSubmissionFile(norm, f.id, username)
        if (!sub) continue
        result.push(await submissionView(norm, f.id, username, sub))
      }
      return result.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
    },

    async getSubmissionDetail(actor, courseSlug, assignmentSlug, username) {
      const norm = normalizeSlug(courseSlug)
      const course = await readCourse(baseDir, norm)
      if (!course) httpError(404, 'Курс не найден')
      const role = await roleOf(actor)
      if (!canGrade(actor, role, course) && !(role.scope === 'owner' && role.permissions.includes('submissions.view.all'))) {
        httpError(403, 'Недостаточно прав')
      }
      const dirId = await resolveEntityDir(norm, 'assignments', assignmentSlug)
      if (!dirId) httpError(404, 'Задание не найдено')
      const f = await readAssignmentFile(norm, dirId)
      if (!f) httpError(404, 'Задание не найдено')
      const sub = await readSubmissionFile(norm, f.id, username)
      if (!sub) httpError(404, 'Сдача не найдена')

      const submission = await submissionView(norm, f.id, username, sub)
      const history = await readSubmissionHistory(norm, f.id, username)
      return { submission, history }
    },

    async gradeSubmission(actor, courseSlug, assignmentSlug, username, input) {
      const norm = normalizeSlug(courseSlug)
      const course = await readCourse(baseDir, norm)
      if (!course) httpError(404, 'Курс не найден')
      const role = await roleOf(actor)
      if (!canGrade(actor, role, course)) httpError(403, 'Недостаточно прав')
      const dirId = await resolveEntityDir(norm, 'assignments', assignmentSlug)
      if (!dirId) httpError(404, 'Задание не найдено')
      const f = await readAssignmentFile(norm, dirId)
      if (!f) httpError(404, 'Задание не найдено')
      const sub = await readSubmissionFile(norm, f.id, username)
      if (!sub) httpError(404, 'Сдача не найдена')

      sub.status = 'returned'
      sub.grade = input.grade
      sub.feedback = input.feedback
      sub.updatedAt = new Date().toISOString()
      await writeSubmissionFile(norm, f.id, username, sub)
      journal.record(actor.pseudonym, `оценил задание ${f.slug} у ${username} в ${norm}`)
      return submissionView(norm, f.id, username, sub)
    },

    // --- тред комментариев сдачи ---

    async listSubmissionComments(actor, courseSlug, assignmentSlug, username) {
      const norm = normalizeSlug(courseSlug)
      const { f } = await loadSubmissionAccess(actor, norm, assignmentSlug, username)
      if (!await readSubmissionFile(norm, f.id, username)) httpError(404, 'Сдача не найдена')
      const dir = submissionCommentsDir(norm, f.id, username)
      let files: string[]
      try {
        files = (await readdir(dir)).filter(x => x.endsWith('.yml'))
      } catch {
        return []
      }
      const result: SubmissionComment[] = []
      for (const file of files) {
        const c = await readYaml<SubmissionComment>(resolveDataPath(dir, file))
        if (c?.id && c.html !== undefined) result.push(c)
      }
      return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },

    async addSubmissionComment(actor, courseSlug, assignmentSlug, username, text) {
      const norm = normalizeSlug(courseSlug)
      const { f } = await loadSubmissionAccess(actor, norm, assignmentSlug, username)
      if (!await readSubmissionFile(norm, f.id, username)) httpError(404, 'Сдача не найдена')
      const comment: SubmissionComment = {
        id: `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`,
        author: actor.username,
        text,
        html: renderDocMarkdown(text, {
          courseSlug: norm,
          materialSlug: 'comments',
          linkTitles: {},
          attachments: [],
        }).html,
        createdAt: new Date().toISOString(),
      }
      const dir = submissionCommentsDir(norm, f.id, username)
      await ensureDir(dir)
      await writeYaml(resolveDataPath(dir, `${comment.id}.yml`), comment)
      journal.record(actor.pseudonym, `прокомментировал сдачу ${f.slug} у ${username} в ${norm}`)
      return comment
    },

    // --- вложения сдачи ---

    async addSubmissionAttachment(actor, courseSlug, assignmentSlug, username, file) {
      const norm = normalizeSlug(courseSlug)
      if (actor.username !== username) httpError(403, 'Можно прикладывать файлы только к своей сдаче')
      const { f } = await loadAssignmentForActor(actor, norm, assignmentSlug, 'submit')
      const name = validateAttachmentName(file.name)
      const dir = submissionAttachmentsDir(norm, f.id, username)
      const existing = await listSubmissionAttachmentNames(norm, f.id, username)
      if (existing.includes(name)) httpError(409, `Файл «${name}» уже приложен — сначала удалите его`)
      await ensureDir(dir)
      await atomicWriteBytes(resolveDataPath(dir, name), file.data)
      journal.record(actor.pseudonym, `приложил файл ${name} к сдаче ${f.slug} в ${norm}`)
      return name
    },

    async removeSubmissionAttachment(actor, courseSlug, assignmentSlug, username, name) {
      const norm = normalizeSlug(courseSlug)
      const { f } = await loadSubmissionAccess(actor, norm, assignmentSlug, username)
      const clean = validateAttachmentName(name)
      await atomicDelete(resolveDataPath(submissionAttachmentsDir(norm, f.id, username), clean))
      journal.record(actor.pseudonym, `удалил файл ${clean} из сдачи ${f.slug} в ${norm}`)
    },

    async getSubmissionAttachment(actor, courseSlug, assignmentSlug, username, name) {
      const norm = normalizeSlug(courseSlug)
      const { f } = await loadSubmissionAccess(actor, norm, assignmentSlug, username)
      const clean = validateAttachmentName(name)
      let data = await readBytes(resolveDataPath(submissionAttachmentsDir(norm, f.id, username), clean))
      if (!data) {
        // файл мог уехать в историю при пересдаче — ищем по версиям (новые → старые)
        try {
          const hdir = submissionHistoryDir(norm, f.id, username)
          const versions = (await readdir(hdir, { withFileTypes: true }))
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort()
            .reverse()
          for (const v of versions) {
            data = await readBytes(resolveDataPath(hdir, v, ATTACHMENTS_DIR, clean))
            if (data) break
          }
        } catch { /* истории нет */ }
      }
      return data ? { data, mime: mimeFor(clean) } : null
    },

    async getSubmissionHistoryAttachment(actor, courseSlug, assignmentSlug, username, file, name) {
      const norm = normalizeSlug(courseSlug)
      const { f } = await loadSubmissionAccess(actor, norm, assignmentSlug, username)
      if (!/^[A-Za-z0-9-]+$/.test(file)) httpError(400, 'Некорректная версия')
      const clean = validateAttachmentName(name)
      const data = await readBytes(resolveDataPath(submissionHistoryDir(norm, f.id, username), file, ATTACHMENTS_DIR, clean))
      return data ? { data, mime: mimeFor(clean) } : null
    },

    // --- лента курса ---

    async listStreamPosts(actor, courseSlug) {
      const norm = normalizeSlug(courseSlug)
      await requireCourseMember(actor, norm)
      const dir = streamDir(norm)
      let files: string[]
      try {
        files = (await readdir(dir)).filter(f => f.endsWith('.yml'))
      } catch {
        return []
      }
      const result: StreamPost[] = []
      for (const file of files) {
        const p = await readYaml<StreamPost>(resolveDataPath(dir, file))
        if (p?.id && p.html !== undefined) {
          // время последнего комментария
          const commentsDir = streamCommentsDir(norm, p.id)
          let latest: string | null = null
          try {
            const commentFiles = (await readdir(commentsDir)).filter(x => x.endsWith('.yml'))
            for (const cf of commentFiles) {
              const c = await readYaml<StreamComment>(resolveDataPath(commentsDir, cf))
              if (c?.createdAt && (!latest || c.createdAt > latest)) latest = c.createdAt
            }
          } catch { /* каталога нет — нет комментариев */ }
          result.push({ ...p, lastCommentAt: latest })
        }
      }
      return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    async addStreamPost(actor, courseSlug, text) {
      const norm = normalizeSlug(courseSlug)
      await requireCourseMember(actor, norm)
      const post: StreamPost = {
        id: `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`,
        author: actor.username,
        text,
        html: renderDocMarkdown(text, {
          courseSlug: norm,
          materialSlug: 'stream',
          linkTitles: {},
          attachments: [],
        }).html,
        createdAt: new Date().toISOString(),
      }
      const dir = streamDir(norm)
      await ensureDir(dir)
      await writeYaml(resolveDataPath(dir, `${post.id}.yml`), post)
      journal.record(actor.pseudonym, `опубликовал пост в ленте ${norm}`)
      return post
    },

    async listStreamComments(actor, courseSlug, postId) {
      const norm = normalizeSlug(courseSlug)
      await requireCourseMember(actor, norm)
      const dir = streamCommentsDir(norm, postId)
      let files: string[]
      try {
        files = (await readdir(dir)).filter(x => x.endsWith('.yml'))
      } catch {
        return []
      }
      const result: StreamComment[] = []
      for (const file of files) {
        const c = await readYaml<StreamComment>(resolveDataPath(dir, file))
        if (c?.id && c.html !== undefined) result.push(c)
      }
      return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },

    async addStreamComment(actor, courseSlug, postId, text) {
      const norm = normalizeSlug(courseSlug)
      await requireCourseMember(actor, norm)
      const comment: StreamComment = {
        id: `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`,
        author: actor.username,
        text,
        html: renderDocMarkdown(text, {
          courseSlug: norm,
          materialSlug: 'comments',
          linkTitles: {},
          attachments: [],
        }).html,
        createdAt: new Date().toISOString(),
      }
      const dir = streamCommentsDir(norm, postId)
      await ensureDir(dir)
      await writeYaml(resolveDataPath(dir, `${comment.id}.yml`), comment)

      // обновляем lastCommentAt в посте
      const postPath = resolveDataPath(streamDir(norm), `${postId}.yml`)
      const post = await readYaml<StreamPost>(postPath)
      if (post) {
        post.lastCommentAt = comment.createdAt
        await writeYaml(postPath, post)
      }

      journal.record(actor.pseudonym, `прокомментировал пост ${postId} в ленте ${norm}`)
      return comment
    },

    // --- трекинг внешних ссылок ---

    async recordLinkClick(actor, courseSlug, entity, url) {
      const norm = normalizeSlug(courseSlug)
      if (!entity || entity.length > 200 || !url || url.length > 2000) return
      if (!(await linkEntityExists(actor, norm, entity))) return
      const now = new Date().toISOString()
      const dir = linkClicksDir(norm, entity)
      const path = resolveDataPath(dir, `${linkHash(url)}.yml`)
      const rec = (await readYaml<LinkClickFile>(path)) ?? { url, users: {} }
      const u = rec.users[actor.username] ?? { count: 0, firstAt: now, lastAt: '' }
      // антиспам: один и тот же пользователь — не чаще раза в минуту на ссылку
      if (u.lastAt && Date.now() - Date.parse(u.lastAt) < 60_000) return
      u.count += 1
      u.lastAt = now
      rec.users[actor.username] = u
      await ensureDir(dir)
      await writeYaml(path, rec)
    },

    async getLinkStats(actor, courseSlug, entity) {
      const norm = normalizeSlug(courseSlug)
      if (!(await canSeeLinkStats(actor, norm, entity))) httpError(403, 'Недостаточно прав')
      const dir = linkClicksDir(norm, entity)
      let files: string[]
      try {
        files = (await readdir(dir)).filter(f => f.endsWith('.yml'))
      } catch {
        return []
      }
      const stats: LinkStat[] = []
      for (const file of files) {
        const rec = await readYaml<LinkClickFile>(resolveDataPath(dir, file))
        if (!rec?.url) continue
        const users = Object.entries(rec.users)
          .map(([username, u]) => ({ username, pseudonym: username, count: u.count, lastAt: u.lastAt }))
          .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
        if (users.length) stats.push({ url: rec.url, users })
      }
      return stats.sort((a, b) => a.url.localeCompare(b.url))
    },

    // --- журнал оценок ---

    async getGradebook(actor, courseSlug) {
      return buildGradebook(actor, normalizeSlug(courseSlug))
    },

    async listStreamFeed(actor) {
      const courses = await visibleCourses(actor)
      const feed: StreamFeedPost[] = []
      for (const c of courses) {
        const dir = streamDir(c.slug)
        let files: string[]
        try {
          files = (await readdir(dir)).filter(f => f.endsWith('.yml'))
        } catch {
          continue
        }
        for (const file of files) {
          const p = await readYaml<StreamPost>(resolveDataPath(dir, file))
          if (p?.id && p.html !== undefined) {
            // время последнего комментария
            const commentsDir = streamCommentsDir(c.slug, p.id)
            let latest: string | null = null
            try {
              const commentFiles = (await readdir(commentsDir)).filter(x => x.endsWith('.yml'))
              for (const cf of commentFiles) {
                const cc = await readYaml<StreamComment>(resolveDataPath(commentsDir, cf))
                if (cc?.createdAt && (!latest || cc.createdAt > latest)) latest = cc.createdAt
              }
            } catch { /* каталога нет — нет комментариев */ }
            feed.push({ ...p, course: c.slug, courseTitle: c.title, lastCommentAt: latest })
          }
        }
      }
      return feed.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100)
    },

    async listGradebooks(actor) {
      const courses = await visibleCourses(actor)
      const sections: GradebookSection[] = []
      for (const c of courses) {
        const book = await buildGradebook(actor, c.slug)
        if (book.assignments.length) sections.push({ course: { slug: c.slug, title: c.title }, book })
      }
      return sections
    },
  }

  /**
   * Write-очередь (specs/10): все методы ContentStore сериализуются по курсу
   * (args[1] = courseSlug у всех методов кроме listCourses/createCourse).
   * Внутренние кросс-вызовы идут через impl — без повторного захвата лока.
   */
  return new Proxy(impl, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const courseSlug = typeof args[1] === 'string' ? args[1] : ''
        return withCourseLock(courseSlug, () =>
          (value as (...a: unknown[]) => unknown).apply(target, args))
      }
    },
  })
}
