import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFilesContentStore } from '../server/adapters/files-content-store'
import { builtinDefaultsFor } from '../server/lib/permissions'
import type { ContentStore } from '../server/ports/content-store'
import type { Quiz, UserPublic } from '#shared/types'

/**
 * Тесты проверок «Закрепление материала» (specs/13-quizzes.md):
 * CRUD, авто-оценка всех типов вопросов, попытки/пересдачи,
 * срезание правильных ответов для ученика, права.
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
const student = actor('s1', 'student')
const student2 = actor('s2', 'student')

let dir = ''
let store: ContentStore
let materialRef = ''

const baseQuiz: Omit<Quiz, 'id' | 'createdAt' | 'updatedAt'> = {
  title: 'Проверка',
  showAnswers: true,
  questions: [
    {
      id: 'q1', type: 'single', prompt: '2+2?', points: 1,
      options: [{ id: 'a', text: '4' }, { id: 'b', text: '5' }],
      correct: 'a',
    },
    {
      id: 'q2', type: 'multi', prompt: 'Гласные?', points: 2,
      options: [{ id: 'a', text: 'а' }, { id: 'b', text: 'б' }, { id: 'c', text: 'е' }],
      correct: ['a', 'c'],
    },
    {
      id: 'q3', type: 'truefalse', prompt: 'Небо зелёное?', points: 1,
      options: [{ id: 't', text: 'Верно' }, { id: 'f', text: 'Неверно' }],
      correct: 'f',
    },
    {
      id: 'q4', type: 'fill', prompt: 'Столица России — {{1}}', points: 1,
      blanks: [{ answers: ['Москва', 'москва'] }],
    },
    {
      id: 'q5', type: 'order', prompt: 'Порядок:', points: 2,
      items: [{ id: 'x', text: 'раз' }, { id: 'y', text: 'два' }, { id: 'z', text: 'три' }],
      correctOrder: ['x', 'y', 'z'],
    },
  ],
}

const perfectAnswers = {
  q1: 'a',
  q2: ['a', 'c'],
  q3: 'f',
  q4: ['Москва'],
  q5: ['x', 'y', 'z'],
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'klassroom-quiz-'))
  store = createFilesContentStore(dir, journal as never, roleStore as never)
  await store.createCourse(teacher, { title: 'Тест', slug: SLUG })
  await store.addStudent(teacher, SLUG, student.username)
  await store.addStudent(teacher, SLUG, student2.username)
  const m = await store.createMaterial(teacher, SLUG, { title: 'Тема', type: 'doc', content: '# Тема' })
  materialRef = m.slug
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('CRUD: create → list → get → update → delete', async () => {
  assert.deepEqual(await store.listQuizzes(teacher, SLUG, materialRef), [])

  const q = await store.createQuiz(teacher, SLUG, materialRef, baseQuiz)
  assert.ok(q.id)
  assert.equal(q.questions.length, 5)

  const list = await store.listQuizzes(teacher, SLUG, materialRef)
  assert.equal(list.length, 1)
  assert.equal(list[0]!.questionCount, 5)
  assert.equal(list[0]!.totalPoints, 7)

  const got = await store.getQuiz(teacher, SLUG, materialRef, q.id)
  assert.equal(got?.title, 'Проверка')
  assert.ok(got?.questions[0]?.correct) // учитель видит решения

  const upd = await store.updateQuiz(teacher, SLUG, materialRef, q.id, { title: 'Новая', showAnswers: false })
  assert.equal(upd.title, 'Новая')
  assert.equal(upd.showAnswers, false)

  await store.deleteQuiz(teacher, SLUG, materialRef, q.id)
  assert.deepEqual(await store.listQuizzes(teacher, SLUG, materialRef), [])
})

test('ученик не видит правильные ответы в getQuiz', async () => {
  const q = await store.createQuiz(teacher, SLUG, materialRef, baseQuiz)
  const got = await store.getQuiz(student, SLUG, materialRef, q.id)
  assert.ok(got)
  for (const qu of got!.questions) {
    assert.equal(qu.correct, undefined, `${qu.id}: correct должен быть срезан`)
    assert.equal(qu.correctOrder, undefined)
    if (qu.blanks) for (const b of qu.blanks) assert.deepEqual(b.answers, [])
  }
  // promptHtml отрендерен
  assert.ok(got!.questions[0]!.promptHtml?.includes('2+2'))
})

test('submit: полный правильный ответ → max score, попытка сохранена', async () => {
  const q = await store.createQuiz(teacher, SLUG, materialRef, baseQuiz)
  const { attempt, results } = await store.submitQuizAttempt(student, SLUG, materialRef, q.id, perfectAnswers)
  assert.equal(attempt.score, 7)
  assert.equal(attempt.total, 7)
  assert.ok(Object.values(results).every(r => r.correct))

  // попытка видна ученику и учителю
  const mine = await store.listQuizAttempts(student, SLUG, materialRef, q.id)
  assert.equal(mine.length, 1)
  assert.equal(mine[0]!.username, 's1')
  const all = await store.listQuizAttempts(teacher, SLUG, materialRef, q.id)
  assert.equal(all.length, 1)

  // сводка обновилась
  const list = await store.listQuizzes(student, SLUG, materialRef)
  assert.equal(list[0]!.myAttempts, 1)
  assert.equal(list[0]!.myBestScore, 7)
})

test('submit: частичные баллы (multi fp, order LCS, fill case-insensitive)', async () => {
  const q = await store.createQuiz(teacher, SLUG, materialRef, baseQuiz)
  const { attempt } = await store.submitQuizAttempt(student, SLUG, materialRef, q.id, {
    q1: 'b',        // single wrong → 0
    q2: ['a', 'b'], // multi: 1 верный + 1 ложный → (1-1)/2 = 0
    q3: 'f',        // tf correct → 1
    q4: ['москва'], // fill: case-insensitive → 1
    q5: ['y', 'x', 'z'], // order: LCS=2 из 3 → 2/3*2 ≈ 1.33
  })
  assert.equal(attempt.score, 0 + 0 + 1 + 1 + 1.33)
})

test('multi: верные+неверные даёт частичный кредит', async () => {
  const q = await store.createQuiz(teacher, SLUG, materialRef, {
    title: 't', questions: [{
      id: 'm', type: 'multi', prompt: 'p', points: 4,
      options: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }, { id: 'c', text: '3' }],
      correct: ['a', 'b'],
    }],
  })
  // выбрал a (верный) + c (ложный): (1-1)/2 = 0
  let r = await store.submitQuizAttempt(student, SLUG, materialRef, q.id, { m: ['a', 'c'] })
  assert.equal(r.attempt.score, 0)
  // выбрал только a: (1-0)/2 = 0.5 → 2 б.
  r = await store.submitQuizAttempt(student, SLUG, materialRef, q.id, { m: ['a'] })
  assert.equal(r.attempt.score, 2)
  // выбрал оба верных: 4
  r = await store.submitQuizAttempt(student, SLUG, materialRef, q.id, { m: ['a', 'b'] })
  assert.equal(r.attempt.score, 4)
})

test('пересдача: все попытки хранятся, best = max', async () => {
  const q = await store.createQuiz(teacher, SLUG, materialRef, baseQuiz)
  await store.submitQuizAttempt(student, SLUG, materialRef, q.id, { q1: 'b' }) // почти всё неверно
  await store.submitQuizAttempt(student, SLUG, materialRef, q.id, perfectAnswers)
  const mine = await store.listQuizAttempts(student, SLUG, materialRef, q.id)
  assert.equal(mine[0]!.attempts.length, 2)
  const list = await store.listQuizzes(student, SLUG, materialRef)
  assert.equal(list[0]!.myAttempts, 2)
  assert.equal(list[0]!.myBestScore, 7)
})

test('ученик не видит чужие попытки', async () => {
  const q = await store.createQuiz(teacher, SLUG, materialRef, baseQuiz)
  await store.submitQuizAttempt(student, SLUG, materialRef, q.id, perfectAnswers)
  const mine2 = await store.listQuizAttempts(student2, SLUG, materialRef, q.id)
  assert.equal(mine2.length, 0) // у s2 попыток нет — и чужих не видно
  const all = await store.listQuizAttempts(teacher, SLUG, materialRef, q.id)
  assert.equal(all.length, 1)
  assert.equal(all[0]!.username, 's1')
})

test('права: студент не может создавать/удалять квизы', async () => {
  const m2 = await store.createMaterial(teacher, SLUG, { title: 'T2', type: 'doc', content: 'x' })
  await assert.rejects(
    store.createQuiz(student, SLUG, m2.slug, baseQuiz),
    /прав|forbidden|403/i,
  )
  const q = await store.createQuiz(teacher, SLUG, m2.slug, baseQuiz)
  await assert.rejects(store.deleteQuiz(student, SLUG, m2.slug, q.id))
  await assert.rejects(store.updateQuiz(student, SLUG, m2.slug, q.id, { title: 'x' }))
})

test('валидация: пустой квиз и дубли id отклоняются', async () => {
  await assert.rejects(
    store.createQuiz(teacher, SLUG, materialRef, { title: 'empty', questions: [] }),
    /вопрос/i,
  )
  await assert.rejects(
    store.createQuiz(teacher, SLUG, materialRef, {
      title: 'dup',
      questions: [
        { id: 'x', type: 'single', prompt: 'p', points: 1, options: [{ id: 'a', text: '1' }], correct: 'a' },
        { id: 'x', type: 'single', prompt: 'p2', points: 1, options: [{ id: 'a', text: '1' }], correct: 'a' },
      ],
    }),
    /Дублирующийся|дублир/i,
  )
})

test('несуществующий квиз/материал → null/404', async () => {
  assert.equal(await store.getQuiz(teacher, SLUG, materialRef, 'nope'), null)
  await assert.rejects(store.submitQuizAttempt(teacher, SLUG, materialRef, 'nope', {}), /не найден/i)
})

test('регрессия: entity id (base64url, регистр значим) резолвится в директорию', async () => {
  // createMaterial возвращает slug — id берём из списка
  const list = await store.listMaterials(teacher, SLUG)
  const m = list.find(x => x.slug === materialRef)!
  assert.ok(m.id)
  // id может содержать uppercase — resolveEntityDir не должен его lowercase'ить
  const got = await store.getMaterial(teacher, SLUG, m.id)
  assert.equal(got?.id, m.id)
  // и по id квизы тоже работают
  const q = await store.createQuiz(teacher, SLUG, m.id, baseQuiz)
  assert.ok(q.id)
  const gotQ = await store.getQuiz(student, SLUG, m.id, q.id)
  assert.equal(gotQ?.title, 'Проверка')
})
