import { resolve } from 'node:path'
import { createFilesContentStore } from '../server/adapters/files-content-store'
import { createFilesUserStore } from '../server/adapters/files-user-store'
import { createGitJournal } from '../server/lib/git-journal'
import { PUBLIC_GROUP, type UserPublic } from '#shared/types'

/**
 * Сид тестового контента: ученики, группы, групповые темы/задания/посты.
 * Идемпотентен: существующие пользователи/группы пропускаются по имени.
 * Запуск: npm run seed
 */

const root = resolve(import.meta.dirname, '..')
const contentDir = resolve(root, 'content')
const usersDir = resolve(root, 'users')

const journal = createGitJournal(contentDir)
const content = createFilesContentStore(contentDir, journal, {
  async listRoles() { return [] },
  async getRole(name: string) {
    const { builtinDefaultsFor } = await import('../server/lib/permissions')
    return builtinDefaultsFor(name)
  },
  async saveRole() { throw new Error('n/a') },
  async deleteRole() { /* noop */ },
} as never)
const users = createFilesUserStore(usersDir)

const admin: UserPublic = { username: 'admin', pseudonym: 'Admin', role: 'admin', createdAt: '' }
const PASSWORD = 'uch2024test'

// 20 учеников: общие для двух курсов, часть пересекается → мульти-группы
const SURNAMES = [
  'Смирнова', 'Кузнецов', 'Попова', 'Волков', 'Соколова',
  'Лебедев', 'Козлова', 'Новиков', 'Морозова', 'Петров',
  'Васильева', 'Зайцев', 'Павлова', 'Семёнов', 'Голубева',
  'Виноградова', 'Богданов', 'Воробьёва', 'Киселёв', 'Макарова',
]
const students = SURNAMES.map((surname, i) => ({
  username: `uch-${String(i + 1).padStart(2, '0')}`,
  pseudonym: surname,
}))

async function ensureUser(u: { username: string, pseudonym: string }) {
  try {
    await users.createUser({ username: u.username, pseudonym: u.pseudonym, role: 'student', password: PASSWORD })
    console.log(`  + user ${u.username} (${u.pseudonym})`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('занят')) console.warn(`  ! ${u.username}: ${msg}`)
  }
}

const EGE = 'podgotovka-k-ege-informatika'
const MATH = 'matematika-5'

// группы: название → usernames
const EGE_GROUPS = [
  { title: 'Сильные', members: ['uch-01', 'uch-02', 'uch-03', 'uch-04', 'uch-05'] },
  { title: 'Средние', members: ['uch-06', 'uch-07', 'uch-08', 'uch-09', 'uch-10'] },
  { title: 'Слабые', members: ['uch-11', 'uch-12', 'uch-13', 'uch-14', 'uch-15'] },
]
const MATH_GROUPS = [
  { title: 'Продвинутые', members: ['uch-11', 'uch-12', 'uch-13', 'uch-14', 'uch-15'] },
  { title: 'Базовый уровень', members: ['uch-16', 'uch-17', 'uch-18', 'uch-19', 'uch-20'] },
  { title: 'Олимпиадники', members: ['uch-01', 'uch-02', 'uch-03', 'uch-04', 'uch-05'] },
]

async function ensureGroup(course: string, title: string, members: string[]) {
  const existing = await content.listGroups(admin, course)
  const found = existing.find(g => g.title === title)
  if (found) {
    // добираем недостающих членов, не выкидывая существующих
    const merged = [...new Set([...found.members, ...members])]
    if (merged.length !== found.members.length) {
      await content.updateGroup(admin, course, found.id, { members: merged })
      console.log(`  ~ group «${title}» в ${course}: +${merged.length - found.members.length} членов`)
    }
    return found.id
  }
  const g = await content.createGroup(admin, course, { title, members })
  console.log(`  + group «${title}» в ${course} (${members.length} чел.)`)
  return g.id
}

async function ensureStudent(course: string, username: string) {
  const c = await content.getCourse(admin, course)
  if (c && !c.students.includes(username)) {
    await content.addStudent(admin, course, username)
  }
}

async function ensureMaterial(course: string, title: string, body: string, groups?: string[]) {
  const list = await content.listMaterials(admin, course)
  if (list.some(m => m.title === title)) return
  await content.createMaterial(admin, course, { title, type: 'doc', content: body, groups })
  console.log(`  + topic «${title}» [${course}]`)
}

async function ensureAssignment(course: string, title: string, description: string, groups?: string[], due?: string) {
  const list = await content.listAssignments(admin, course)
  const existing = list.find(a => a.title === title)
  if (existing) {
    if (existing.status !== 'published') {
      await content.updateAssignment(admin, course, existing.slug, { status: 'published' })
    }
    return
  }
  const a = await content.createAssignment(admin, course, {
    title, type: 'general', description, due: due ?? null, maxPoints: 10, groups,
  })
  await content.updateAssignment(admin, course, a.slug, { status: 'published' })
  console.log(`  + assignment «${title}» [${course}]`)
}

async function ensurePost(course: string, text: string, groups?: string[]) {
  const posts = await content.listStreamPosts(admin, course)
  if (posts.some(p => p.text === text)) return
  await content.addStreamPost(admin, course, text, groups)
  console.log(`  + post [${course}]: ${text.slice(0, 40)}`)
}

async function main() {
  console.log('— пользователи —')
  for (const u of students) await ensureUser(u)

  for (const [course, groups] of [[EGE, EGE_GROUPS], [MATH, MATH_GROUPS]] as const) {
    console.log(`— курс ${course} —`)
    const memberNames = [...new Set(groups.flatMap(g => g.members))]
    for (const u of memberNames) await ensureStudent(course, u)

    console.log('  группы:')
    const ids: Record<string, string> = {}
    for (const g of groups) ids[g.title] = await ensureGroup(course, g.title, g.members)

    console.log('  контент:')
    if (course === EGE) {
      await ensureMaterial(course, 'Дополнительно: оптимизация алгоритмов',
        '## Для сильных\n\nРазбор задач 24–27 на максимум: жадные алгоритмы, динамическое программирование, защита от взлома.', [ids['Сильные']])
      await ensureMaterial(course, 'Разбор типовых ошибок ЕГЭ',
        '## Средний уровень\n\nТоп-10 ошибок на экзамене и как их избежать. Разбираем решения прошлых лет.', [ids['Средние']])
      await ensureMaterial(course, 'Шпаргалка: системы счисления',
        '## База\n\nТаблицы перевода, примеры, тренажёр устного счёта.', [ids['Слабые']])
      await ensureMaterial(course, 'Пробный вариант №3 — разбор',
        '## Всем\n\nРазбираем пробник целиком: где теряются баллы и как тренироваться.', [PUBLIC_GROUP])

      await ensureAssignment(course, 'Олимпиадная задача: строки',
        'Задача повышенной сложности на обработку строк. Решение — полное обоснование.', [ids['Сильные']], '2026-12-05')
      await ensureAssignment(course, 'Контрольная: системы счисления',
        '8 задач на перевод между системами счисления. Срок — неделя.', [ids['Средние']], '2026-11-30')
      await ensureAssignment(course, 'Повторение: логика и таблицы',
        'Базовые задачи на логические выражения и таблицы истинности.', [ids['Слабые']], '2026-11-28')

      await ensurePost(course, 'Всем: пробник №3 — до пятницы, потом разбор на уроке.', [PUBLIC_GROUP])
      await ensurePost(course, 'Сильным: смотрите прикреплённую олимпиадную задачу, дедлайн в пятницу.', [ids['Сильные']])
      await ensurePost(course, 'Средним: контрольная по системам счисления выдана, вопросы — в обсуждении.', [ids['Средние']])
      await ensurePost(course, 'Слабым: не переживайте, идём по шагам — первая тема уже в конспектах.', [ids['Слабые']])
    } else {
      await ensureMaterial(course, 'Дроби — шпаргалка',
        '## Для всех\n\nСложение, вычитание, умножение дробей + 20 примеров с ответами.', [PUBLIC_GROUP])
      await ensureMaterial(course, 'План работы на год',
        '## Для всех\n\nКалендарный план: темы, контрольные, четвертные.', [PUBLIC_GROUP])
      await ensureMaterial(course, 'Факториал и комбинаторика',
        '## Продвинутым\n\nФакториалы, перестановки, сочетания — с задачами повышенной сложности.', [ids['Продвинутые']])
      await ensureMaterial(course, 'Дроби: разбор ошибок',
        '## Базовый уровень\n\nТипичные ошибки в действиях с дробями и как их не допускать.', [ids['Базовый уровень']])
      await ensureMaterial(course, 'Олимпиадные задачи: инварианты',
        '## Олимпиадникам\n\nМетод инвариантов на примерах прошлых олимпиад.', [ids['Олимпиадники']])

      await ensureAssignment(course, 'Комбинаторика: задачи повышенной сложности',
        '5 задач на факториалы и сочетания. Для продвинутых.', [ids['Продвинутые']], '2026-12-01')
      await ensureAssignment(course, 'Контрольная: дроби',
        '12 примеров на все действия с дробями + 3 текстовые задачи.', [ids['Базовый уровень']], '2026-11-29')
      await ensureAssignment(course, 'Олимпиада «Кенгуру» — отборочный тур',
        'Задания отборочного тура с разбором.', [ids['Олимпиадники']], '2026-12-10')

      await ensurePost(course, 'Всем: контрольная по дробям в четверг, материалы — в теме «Дроби — шпаргалка».', [PUBLIC_GROUP])
      await ensurePost(course, 'Продвинутым: новая тема «Факториал и комбинаторика» уже в списке.', [ids['Продвинутые']])
      await ensurePost(course, 'Базовым: смотрите разбор ошибок — он снимет 80% проблем с дробями.', [ids['Базовый уровень']])
      await ensurePost(course, 'Олимпиадникам: отборочный тур «Кенгуру» — регистрируйтесь до пятницы.', [ids['Олимпиадники']])
    }
  }

  console.log('— готово —')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
