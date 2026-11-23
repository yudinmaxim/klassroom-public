import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { createFilesContentStore } from '../server/adapters/files-content-store'
import { builtinDefaultsFor } from '../server/lib/permissions'
import type { ContentStore } from '../server/ports/content-store'
import type { UserPublic } from '#shared/types'
import { PUBLIC_GROUP } from '#shared/types'

/**
 * Тесты групповой видимости контента (groups/<gid>.yml + groups[] у
 * материалов/заданий/постов). Адаптер гоняется на tmp-каталоге,
 * RoleStore — системные дефолты, журнал — заглушка.
 *
 * Запуск: npm test (jiti + node:test).
 */

const roleStore = {
  async listRoles() { return [] },
  async getRole(name: string) { return builtinDefaultsFor(name) },
  async saveRole() { throw new Error('not implemented') },
  async deleteRole() { /* noop */ },
}
const journal = { record() { /* noop */ } }

const SLUG = 'test-course'

function actor(username: string, role: string): UserPublic {
  return { username, pseudonym: username, role: role as UserPublic['role'], createdAt: '' }
}
const teacher = actor('teacher', 'teacher')
const outsider = actor('outsider', 'teacher') // учитель чужого курса

// s1..s3 → «сильные», s4..s6 → «слабые», s7 — без группы
const S = (n: number) => actor(`s${n}`, 'student')
const ALL = [1, 2, 3, 4, 5, 6, 7].map(S)

let dir = ''
let store: ContentStore
let strongId = ''
let weakId = ''

async function setup() {
  dir = await mkdtemp(join(tmpdir(), 'klassroom-test-'))
  store = createFilesContentStore(dir, journal as never, roleStore as never)
  await store.createCourse(teacher, { title: 'Тест', slug: SLUG })
  for (const s of ALL) await store.addStudent(teacher, SLUG, s.username)
  const g1 = await store.createGroup(teacher, SLUG, { title: 'Сильные', members: ['s1', 's2', 's3'] })
  const g2 = await store.createGroup(teacher, SLUG, { title: 'Слабые', members: ['s4', 's5', 's6'] })
  strongId = g1.id
  weakId = g2.id
}

async function teardown() {
  await rm(dir, { recursive: true, force: true })
}

async function makeMaterial(title: string, groups?: string[]) {
  return store.createMaterial(teacher, SLUG, { title, type: 'doc', content: `# ${title}`, groups })
}

async function makeAssignment(title: string, groups?: string[], extra: Record<string, unknown> = {}) {
  const a = await store.createAssignment(teacher, SLUG, {
    title, type: 'general', groups, ...extra,
  })
  await store.updateAssignment(teacher, SLUG, a.slug, { status: 'published' })
  return a.slug
}

/** Прочитать material.yml первого найденного материала и убрать groups (имитация legacy-файла). */
async function stripGroupsFromFirstMaterial() {
  const root = join(dir, 'courses', SLUG, 'materials')
  const id = (await readdir(root))[0]
  const p = join(root, id, 'material.yml')
  const f = parseYaml(await readFile(p, 'utf8'))
  delete f.groups
  await writeFile(p, stringifyYaml(f))
}

beforeEach(setup)
afterEach(teardown)

// --- группы: CRUD и валидация ---

test('ученик не может управлять группами', async () => {
  await assert.rejects(
    store.createGroup(S(1), SLUG, { title: 'Хак' }),
    (e: { statusCode?: number }) => e.statusCode === 403,
  )
  await assert.rejects(
    store.deleteGroup(S(1), SLUG, strongId),
    (e: { statusCode?: number }) => e.statusCode === 403,
  )
})

test('чужой курс: группы не видны и не управляются', async () => {
  await assert.rejects(store.listGroups(outsider, SLUG), (e: { statusCode?: number }) => e.statusCode === 404)
  await assert.rejects(store.createGroup(outsider, SLUG, { title: 'X' }), (e: { statusCode?: number }) => e.statusCode === 403 || e.statusCode === 404)
})

test('состав группы валидируется по roster', async () => {
  await assert.rejects(
    store.createGroup(teacher, SLUG, { title: 'X', members: ['s1', 'ghost'] }),
    (e: { statusCode?: number }) => e.statusCode === 400,
  )
  await assert.rejects(
    store.updateGroup(teacher, SLUG, strongId, { members: ['s1', 'ghost'] }),
    (e: { statusCode?: number }) => e.statusCode === 400,
  )
})

test('удаление несуществующей группы → 404', async () => {
  await assert.rejects(
    store.deleteGroup(teacher, SLUG, 'no-such-group'),
    (e: { statusCode?: number }) => e.statusCode === 404,
  )
})

// --- темы (материалы) ---

test('новая тема без groups → публичная, видна всем', async () => {
  const m = await makeMaterial('Публичная тема')
  assert.deepEqual(m.groups, [PUBLIC_GROUP])
  for (const s of ALL) {
    const list = await store.listMaterials(s, SLUG)
    assert.ok(list.some(x => x.slug === m.slug), `s${s.username} должен видеть публичную тему`)
  }
})

test('тема с groups:[] скрыта от учеников, видна учителю', async () => {
  const m = await makeMaterial('Без группы', [])
  for (const s of ALL) {
    const list = await store.listMaterials(s, SLUG)
    assert.ok(!list.some(x => x.slug === m.slug), `${s.username} не должен видеть безгрупповую тему`)
    await assert.rejects(store.getMaterial(s, SLUG, m.slug), (e: { statusCode?: number }) => e.statusCode === 404)
  }
  const tList = await store.listMaterials(teacher, SLUG)
  assert.ok(tList.some(x => x.slug === m.slug && x.groups.length === 0))
  assert.ok(await store.getMaterial(teacher, SLUG, m.slug))
})

test('групповая тема видна только членам группы', async () => {
  const m = await makeMaterial('Сильным', [strongId])
  for (const n of [1, 2, 3]) {
    assert.ok((await store.listMaterials(S(n), SLUG)).some(x => x.slug === m.slug))
  }
  for (const n of [4, 5, 6, 7]) {
    assert.ok(!(await store.listMaterials(S(n), SLUG)).some(x => x.slug === m.slug))
    await assert.rejects(store.getMaterial(S(n), SLUG, m.slug), (e: { statusCode?: number }) => e.statusCode === 404)
  }
})

test('ученик в двух группах видит объединение контента', async () => {
  await store.updateGroup(teacher, SLUG, strongId, { members: ['s1', 's7'] })
  const mStrong = await makeMaterial('Сильным', [strongId])
  const mWeak = await makeMaterial('Слабым', [weakId])
  // s7 теперь в «Сильных» — видит mStrong, но не mWeak
  const list = await store.listMaterials(S(7), SLUG)
  assert.ok(list.some(x => x.slug === mStrong.slug))
  assert.ok(!list.some(x => x.slug === mWeak.slug))
})

test('смена состава группы мгновенно меняет видимость', async () => {
  const m = await makeMaterial('Сильным', [strongId])
  assert.ok((await store.listMaterials(S(4), SLUG)).every(x => x.slug !== m.slug))
  await store.updateGroup(teacher, SLUG, strongId, { members: ['s1', 's2', 's3', 's4'] })
  assert.ok((await store.listMaterials(S(4), SLUG)).some(x => x.slug === m.slug))
  await store.updateGroup(teacher, SLUG, strongId, { members: ['s1'] })
  assert.ok((await store.listMaterials(S(4), SLUG)).every(x => x.slug !== m.slug))
})

test('legacy-тема без поля groups → публичная', async () => {
  const m = await makeMaterial('Старая тема')
  await stripGroupsFromFirstMaterial()
  for (const n of [1, 4, 7]) {
    assert.ok((await store.listMaterials(S(n), SLUG)).some(x => x.slug === m.slug))
  }
})

test('неизвестная группа отклоняется при записи темы', async () => {
  await assert.rejects(
    store.createMaterial(teacher, SLUG, { title: 'X', type: 'doc', content: 'x', groups: ['ghost-group'] }),
    (e: { statusCode?: number }) => e.statusCode === 400,
  )
  const m = await makeMaterial('Норм')
  await assert.rejects(
    store.updateMaterial(teacher, SLUG, m.slug, { groups: ['ghost-group'] }),
    (e: { statusCode?: number }) => e.statusCode === 400,
  )
})

// --- задания ---

test('групповое задание: видно членам, скрыто остальным', async () => {
  const slug = await makeAssignment('Сильным', [strongId])
  for (const n of [1, 2, 3]) {
    assert.ok((await store.listAssignments(S(n), SLUG)).some(a => a.slug === slug))
    assert.ok(await store.getAssignment(S(n), SLUG, slug))
  }
  for (const n of [4, 5, 6, 7]) {
    assert.ok(!(await store.listAssignments(S(n), SLUG)).some(a => a.slug === slug))
    await assert.rejects(store.getAssignment(S(n), SLUG, slug), (e: { statusCode?: number }) => e.statusCode === 404)
  }
  // учитель видит всё
  assert.ok((await store.listAssignments(teacher, SLUG)).some(a => a.slug === slug))
})

test('безгрупповое задание скрыто от учеников, но сдано быть не может', async () => {
  const slug = await makeAssignment('Без группы', [])
  for (const s of ALL) {
    assert.ok(!(await store.listAssignments(s, SLUG)).some(a => a.slug === slug))
    await assert.rejects(
      store.submitAssignment(s, SLUG, slug, 'ответ'),
      (e: { statusCode?: number }) => e.statusCode === 403 || e.statusCode === 404,
    )
  }
})

test('частное задание + группа: нужны ОБА условия', async () => {
  // private для s4 + группа «сильные» → s4 не в сильных → не видит;
  // s1 в сильных, но не в audience → не видит; никто из тестовых не видит.
  const slug = await makeAssignment('Странное', [strongId], { type: 'private', audience: ['s4'] })
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    assert.ok(!(await store.listAssignments(S(n), SLUG)).some(a => a.slug === slug), `s${n}`)
  }
  // добавим s1 в audience → s1 видит (и группа, и audience совпадают)
  await store.updateAssignment(teacher, SLUG, slug, { audience: ['s1', 's4'] })
  assert.ok((await store.listAssignments(S(1), SLUG)).some(a => a.slug === slug))
  assert.ok(!(await store.listAssignments(S(4), SLUG)).some(a => a.slug === slug), 's4 в audience, но не в группе')
})

test('неизвестная группа отклоняется при записи задания', async () => {
  await assert.rejects(
    store.createAssignment(teacher, SLUG, { title: 'X', type: 'general', groups: ['ghost'] }),
    (e: { statusCode?: number }) => e.statusCode === 400,
  )
})

// --- лента ---

test('посты ленты фильтруются по группам', async () => {
  await store.addStreamPost(teacher, SLUG, 'всем', [PUBLIC_GROUP])
  await store.addStreamPost(teacher, SLUG, 'сильным', [strongId])
  await store.addStreamPost(teacher, SLUG, 'слабым', [weakId])
  const texts = async (s: UserPublic) => (await store.listStreamPosts(s, SLUG)).map(p => p.text).sort()
  assert.deepEqual(await texts(S(1)), ['всем', 'сильным'])
  assert.deepEqual(await texts(S(4)), ['всем', 'слабым'])
  assert.deepEqual(await texts(S(7)), ['всем'])
  // учитель видит всё
  assert.deepEqual((await texts(teacher)).length, 3)
})

test('ученик может постить только в public и свои группы', async () => {
  // s1 в «сильных» — может постить туда и в public
  await store.addStreamPost(S(1), SLUG, 'своим', [strongId])
  await assert.rejects(
    store.addStreamPost(S(1), SLUG, 'чужим', [weakId]),
    (e: { statusCode?: number }) => e.statusCode === 400,
  )
  await assert.rejects(
    store.addStreamPost(S(1), SLUG, 'призрак', ['ghost']),
    (e: { statusCode?: number }) => e.statusCode === 400,
  )
})

test('глобальная лента фильтрует групповые посты', async () => {
  await store.addStreamPost(teacher, SLUG, 'публичный', [PUBLIC_GROUP])
  await store.addStreamPost(teacher, SLUG, 'групповой', [strongId])
  const feed1 = await store.listStreamFeed(S(1))
  assert.deepEqual(feed1.map(p => p.text).sort(), ['групповой', 'публичный'])
  const feed7 = await store.listStreamFeed(S(7))
  assert.deepEqual(feed7.map(p => p.text), ['публичный'])
})

// --- удаление группы ---

test('удаление группы: контент сохраняется, но становится безгрупповым', async () => {
  const m = await makeMaterial('Сильным', [strongId])
  const a = await makeAssignment('Сильным', [strongId])
  await store.addStreamPost(teacher, SLUG, 'сильным', [strongId])

  await store.deleteGroup(teacher, SLUG, strongId)

  // контент на месте, groups очищены
  const mat = await store.getMaterial(teacher, SLUG, m.slug)
  assert.ok(mat)
  assert.deepEqual(mat.groups, [])
  const asg = await store.getAssignment(teacher, SLUG, a)
  assert.ok(asg)
  assert.deepEqual(asg.groups, [])

  // ученики ничего не видят
  for (const n of [1, 2, 3]) {
    assert.ok(!(await store.listMaterials(S(n), SLUG)).some(x => x.slug === m.slug))
    assert.ok(!(await store.listAssignments(S(n), SLUG)).some(x => x.slug === a))
    assert.ok(!(await store.listStreamPosts(S(n), SLUG)).some(p => p.text === 'сильным'))
  }
  // пост не удалён — учитель видит
  assert.ok((await store.listStreamPosts(teacher, SLUG)).some(p => p.text === 'сильным'))

  // группа удалена — ссылаться на неё нельзя
  await assert.rejects(
    store.updateMaterial(teacher, SLUG, m.slug, { groups: [strongId] }),
    (e: { statusCode?: number }) => e.statusCode === 400,
  )
})

test('удаление одной из нескольких групп оставляет контент живым', async () => {
  const m = await makeMaterial('Обеим', [strongId, weakId])
  await store.deleteGroup(teacher, SLUG, strongId)
  const mat = await store.getMaterial(teacher, SLUG, m.slug)
  assert.deepEqual(mat?.groups, [weakId])
  // s4 (слабые) видит, s1 (бывшие сильные) — нет
  assert.ok((await store.listMaterials(S(4), SLUG)).some(x => x.slug === m.slug))
  assert.ok(!(await store.listMaterials(S(1), SLUG)).some(x => x.slug === m.slug))
})

test('группа с public + gid: public побеждает, gid можно убрать', async () => {
  const m = await makeMaterial('Всем и сильным', [PUBLIC_GROUP, strongId])
  for (const n of [1, 4, 7]) {
    assert.ok((await store.listMaterials(S(n), SLUG)).some(x => x.slug === m.slug))
  }
})
