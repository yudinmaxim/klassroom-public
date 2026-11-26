<script setup lang="ts">
import type { Quiz, QuizAttempt, QuizQuestion } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'

/** Прохождение проверки «Закрепление материала» + история попыток. */
const route = useRoute()
const slug = computed(() => String(route.params.course))
const materialId = computed(() => String(route.params.id))
const quizId = computed(() => String(route.params.quiz))

const quizUrl = computed(() => `/api/courses/${slug.value}/topics/${materialId.value}/quizzes/${quizId.value}`)

const { data, error: loadError } = await useFetch<{ quiz: Quiz }>(quizUrl)
if (loadError.value) {
  throw createError({ statusCode: 404, message: 'Проверка не найдена', fatal: true })
}
const quiz = computed(() => data.value?.quiz ?? null)

const { data: coursePageData } = useCourseContext()
const canEdit = computed(() => coursePageData.value?.canMaterials ?? false)

const { data: me } = useFetch<{ user?: { username?: string } }>('/api/auth/me', { key: 'me' })
const myUsername = computed(() => me.value?.user?.username ?? '')

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const courseTitle = coursePageData.value?.course?.title ?? slug.value
  crumbs.value = quiz.value
    ? [
        { label: 'Курсы', to: '/' },
        { label: courseTitle, to: `/courses/${slug.value}` },
        { label: 'Темы', to: `/courses/${slug.value}/topics` },
        { label: quiz.value.title },
      ]
    : [{ label: 'Курсы', to: '/' }]
})

// --- состояние ответов ---
// single/truefalse: optionId; multi: optionId[]; fill: string[]; order: itemId[] (порядок выбора)
const answers = reactive<Record<string, unknown>>({})

// order-вопросы: перемешанный список элементов (перемешиваем один раз)
const orderPools = reactive<Record<string, { id: string, text: string }[]>>({})
watchEffect(() => {
  for (const qu of quiz.value?.questions ?? []) {
    if (qu.type === 'order' && qu.items && !orderPools[qu.id]) {
      orderPools[qu.id] = shuffle([...qu.items])
    }
  }
})
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

function orderAnswer(qu: QuizQuestion): string[] {
  const v = answers[qu.id]
  return Array.isArray(v) ? v as string[] : []
}
function moveOrderItem(qu: QuizQuestion, itemId: string, dir: -1 | 1) {
  const list = orderAnswer(qu)
  const i = list.indexOf(itemId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  const next = [...list]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  answers[qu.id] = next
}

// fill: promptHtml содержит {{n}} — разбиваем на сегменты и инпуты
function fillSegments(qu: QuizQuestion): { html: string, blank: number }[] {
  const html = qu.promptHtml ?? qu.prompt
  const parts = html.split(/(\{\{\s*\d+\s*\}\})/g)
  const out: { html: string, blank: number }[] = []
  for (const p of parts) {
    const m = p.match(/^\{\{\s*(\d+)\s*\}\}$/)
    if (m) out.push({ html: '', blank: Number(m[1]) })
    else if (p) out.push({ html: p, blank: 0 })
  }
  return out
}
function blankCountOf(qu: QuizQuestion): number {
  let max = 0
  for (const m of qu.prompt.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]))
  return max
}
function fillAnswer(qu: QuizQuestion, n: number): string {
  const v = answers[qu.id]
  return Array.isArray(v) ? String(v[n - 1] ?? '') : ''
}
function setFillAnswer(qu: QuizQuestion, n: number, v: string) {
  const arr = Array.from({ length: blankCountOf(qu) }, (_, i) => {
    const cur = answers[qu.id]
    return Array.isArray(cur) ? String(cur[i] ?? '') : ''
  })
  arr[n - 1] = v
  answers[qu.id] = arr
}

// --- форматирование ответов для разбора ---
function optionText(qu: QuizQuestion, id: string) {
  return qu.options?.find(o => o.id === id)?.text ?? qu.items?.find(o => o.id === id)?.text ?? id
}
function correctIds(qu: QuizQuestion): string[] {
  if (qu.type === 'multi') return Array.isArray(qu.correct) ? qu.correct : []
  return typeof qu.correct === 'string' ? [qu.correct] : []
}
function formatGiven(qu: QuizQuestion, given: unknown): string {
  if (given === undefined || given === null || given === '') return '—'
  if (qu.type === 'fill') {
    return Array.isArray(given) ? given.map(String).join(' / ') : String(given)
  }
  if (qu.type === 'order') {
    return (given as string[]).map(id => optionText(qu, id)).join(' → ')
  }
  if (Array.isArray(given)) return given.map(id => optionText(qu, id)).join(', ')
  return optionText(qu, String(given))
}
function formatCorrect(qu: QuizQuestion): string {
  if (!canSeeAnswers.value) return 'скрыто'
  if (qu.type === 'fill') {
    return (qu.blanks ?? []).map((b, i) => `пропуск ${i + 1}: ${b.answers.join(' / ')}`).join('; ')
  }
  if (qu.type === 'order') {
    const order = qu.correctOrder ?? []
    return order.map(id => optionText(qu, id)).join(' → ')
  }
  return correctIds(qu).map(id => optionText(qu, id)).join(', ')
}
const canSeeAnswers = computed(() => {
  // учитель видит ответы всегда; ученику — по флагу квиза, и только после попытки
  if (canEdit.value) return true
  return !!quiz.value?.showAnswers && !!lastResult.value
})

// --- отправка ---
const submitting = ref(false)
const submitError = ref('')
const lastResult = ref<{ attempt: QuizAttempt, results: Record<string, { correct: boolean, score: number }> } | null>(null)

async function submit() {
  submitting.value = true
  submitError.value = ''
  try {
    lastResult.value = await $fetch(`${quizUrl.value}/attempts`, {
      method: 'POST',
      body: { answers: { ...answers } },
    })
    await loadAttempts()
  } catch (e) {
    submitError.value = errText(e, 'Не удалось отправить ответы')
  } finally {
    submitting.value = false
  }
}

// --- история попыток (для ученика — только свои) ---
const { data: attemptsData, refresh: loadAttempts } = await useFetch<{ attempts: { username: string, attempts: QuizAttempt[] }[] }>(
  () => `${quizUrl.value}/attempts`,
)
const mine = computed(() =>
  (attemptsData.value?.attempts ?? []).find(a => a.username === myUsername.value)?.attempts ?? [],
)

const showReview = ref(false)
const reviewedAttempt = ref<QuizAttempt | null>(null)

function retry() {
  for (const k of Object.keys(answers)) answers[k] = undefined
  lastResult.value = null
  showReview.value = false
  reviewedAttempt.value = null
}

function typeHint(qu: QuizQuestion): string {
  switch (qu.type) {
    case 'single': return 'Выберите один ответ'
    case 'truefalse': return 'Выберите: верно или неверно'
    case 'multi': return 'Выберите один или несколько ответов'
    case 'fill': return 'Впишите пропущенные слова в поля'
    case 'order': return 'Расставьте элементы в правильном порядке: нажимайте на них в нужной последовательности'
    default: return ''
  }
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div v-if="quiz" class="course-page">
    <div class="course-content quiz-page">
      <header class="page-head">
        <div>
          <h1 class="page-title">{{ quiz.title }}</h1>
          <p class="muted">
            {{ quiz.questions.length }} вопросов · {{ quiz.questions.reduce((s, q) => s + q.points, 0) }} баллов
          </p>
        </div>
      </header>

      <!-- Результат последней попытки -->
      <div v-if="lastResult" class="quiz-result">
        <h2>Результат: {{ lastResult.attempt.score }}/{{ lastResult.attempt.total }}</h2>
        <div v-if="canSeeAnswers" class="quiz-review">
          <div
            v-for="(qu, qi) in quiz.questions"
            :key="qu.id"
            class="quiz-review-q"
            :class="{ ok: lastResult.results[qu.id]?.correct, bad: !lastResult.results[qu.id]?.correct }"
          >
            <p class="quiz-review-prompt">
              <b>{{ qi + 1 }}.</b>
              <!-- eslint-disable-next-line vue/no-v-html -- promptHtml санитизирован сервером -->
              <span v-html="qu.promptHtml ?? qu.prompt" />
              <span class="muted"> ({{ qu.points }} б.)</span>
            </p>
            <p class="quiz-review-ans">
              Ваш ответ: <b>{{ formatGiven(qu, lastResult.attempt.answers[qu.id]) }}</b>
              · Правильно: <b>{{ formatCorrect(qu) }}</b>
              <span class="muted"> · {{ lastResult.results[qu.id]?.score ?? 0 }} б.</span>
            </p>
          </div>
        </div>
        <div class="quiz-result-actions">
          <button class="primary" @click="retry">Пройти ещё раз</button>
        </div>
      </div>

      <!-- Форма прохождения -->
      <form v-else class="quiz-form" @submit.prevent="submit">
        <div v-for="qu in quiz.questions" :key="qu.id" class="quiz-q">
          <p class="quiz-q-title">
            <!-- eslint-disable-next-line vue/no-v-html -- promptHtml санитизирован сервером -->
            <span v-html="qu.promptHtml ?? qu.prompt" />
            <span class="muted"> · {{ qu.points }} б.</span>
          </p>
          <p class="quiz-hint muted">{{ typeHint(qu) }}</p>

          <!-- single / truefalse -->
          <template v-if="qu.type === 'single' || qu.type === 'truefalse'">
            <label v-for="opt in qu.options" :key="opt.id" class="quiz-opt">
              <input v-model="answers[qu.id]" type="radio" :name="qu.id" :value="opt.id">
              {{ opt.text }}
            </label>
          </template>

          <!-- multi -->
          <template v-else-if="qu.type === 'multi'">
            <label v-for="opt in qu.options" :key="opt.id" class="quiz-opt">
              <input
                type="checkbox"
                :checked="Array.isArray(answers[qu.id]) && (answers[qu.id] as string[]).includes(opt.id)"
                @change="(($event.target as HTMLInputElement).checked
                  ? (answers[qu.id] = [...(Array.isArray(answers[qu.id]) ? answers[qu.id] as string[] : []), opt.id])
                  : (answers[qu.id] = (Array.isArray(answers[qu.id]) ? answers[qu.id] as string[] : []).filter(x => x !== opt.id)))"
              >
              {{ opt.text }}
            </label>
          </template>

          <!-- fill -->
          <template v-else-if="qu.type === 'fill'">
            <div class="quiz-fill">
              <template v-for="(seg, si) in fillSegments(qu)" :key="si">
                <!-- eslint-disable-next-line vue/no-v-html -- promptHtml санитизирован сервером -->
                <span v-if="seg.html" class="quiz-fill-html" v-html="seg.html" />
                <input
                  v-else
                  class="quiz-fill-input"
                  :placeholder="`Пропуск ${seg.blank}`"
                  :value="fillAnswer(qu, seg.blank)"
                  @input="setFillAnswer(qu, seg.blank, ($event.target as HTMLInputElement).value)"
                >
              </template>
            </div>
          </template>

          <!-- order: пул невыбранных + список в порядке выбора -->
          <template v-else>
            <div v-if="orderAnswer(qu).length" class="quiz-order">
              <div v-for="(itemId, idx) in orderAnswer(qu)" :key="itemId" class="quiz-order-item">
                <span class="quiz-order-num">{{ idx + 1 }}</span>
                {{ optionText(qu, itemId) }}
                <span class="quiz-order-tools">
                  <IconBtn icon="lucide:arrow-up" label="Выше" :disabled="idx === 0" @click="moveOrderItem(qu, itemId, -1)" />
                  <IconBtn icon="lucide:arrow-down" label="Ниже" :disabled="idx === orderAnswer(qu).length - 1" @click="moveOrderItem(qu, itemId, 1)" />
                  <IconBtn icon="lucide:x" label="Убрать" @click="answers[qu.id] = orderAnswer(qu).filter(x => x !== itemId)" />
                </span>
              </div>
            </div>
            <div class="quiz-order-pool">
              <button
                v-for="item in (orderPools[qu.id] ?? []).filter(i => !orderAnswer(qu).includes(i.id))"
                :key="item.id"
                type="button"
                class="quiz-pool-item"
                @click="answers[qu.id] = [...orderAnswer(qu), item.id]"
              >{{ item.text }}</button>
              <span v-if="!(orderPools[qu.id] ?? []).some(i => !orderAnswer(qu).includes(i.id))" class="muted">
                Все элементы расставлены
              </span>
            </div>
          </template>
        </div>

        <p v-if="submitError" class="error">{{ submitError }}</p>
        <button type="submit" class="primary" :disabled="submitting">
          {{ submitting ? 'Проверяю…' : 'Проверить' }}
        </button>
      </form>

      <!-- История попыток -->
      <section v-if="mine.length" class="quiz-history">
        <h2>Мои попытки</h2>
        <ul>
          <li v-for="(a, i) in [...mine].reverse()" :key="i">
            <button class="linklike" @click="reviewedAttempt = a; showReview = true">
              Попытка {{ mine.length - i }}: {{ a.score }}/{{ a.total }} · {{ fmtDate(a.submittedAt) }}
            </button>
          </li>
        </ul>
      </section>
    </div>

    <!-- Разбор попытки -->
    <BaseModal
      v-if="showReview && reviewedAttempt && quiz"
      :title="`Разбор попытки · ${reviewedAttempt.score}/${reviewedAttempt.total}`"
      width="min(760px, 94vw)"
      height="min(720px, 90vh)"
      @close="showReview = false"
    >
      <div class="quiz-review">
        <div
          v-for="(qu, qi) in quiz.questions"
          :key="qu.id"
          class="quiz-review-q"
          :class="{ ok: reviewedAttempt.results?.[qu.id]?.correct, bad: !reviewedAttempt.results?.[qu.id]?.correct }"
        >
          <p class="quiz-review-prompt">
            <b>{{ qi + 1 }}.</b>
            <!-- eslint-disable-next-line vue/no-v-html -- promptHtml санитизирован сервером -->
              <span v-html="qu.promptHtml ?? qu.prompt" />
            <span class="muted"> ({{ qu.points }} б.)</span>
          </p>
          <p class="quiz-review-ans">
            Ваш ответ: <b>{{ formatGiven(qu, reviewedAttempt.answers[qu.id]) }}</b>
            <template v-if="canSeeAnswers"> · Правильно: <b>{{ formatCorrect(qu) }}</b></template>
          </p>
        </div>
      </div>
    </BaseModal>
  </div>
</template>

<style scoped>
.quiz-page { max-width: 780px; }
.quiz-form { display: flex; flex-direction: column; gap: 18px; }
.quiz-q {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--card);
}
.quiz-q-title { margin: 0 0 10px; font-weight: 600; }
.quiz-hint { margin: 6px 0 10px; font-size: 13px; }
.quiz-opt { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; }
.quiz-fill { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; line-height: 2; }
.quiz-fill-input {
  min-width: 120px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
}
.quiz-order { margin: 0 0 8px; display: flex; flex-direction: column; gap: 6px; }
.quiz-order-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.quiz-order-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--line);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}
.quiz-order-tools { margin-left: auto; display: inline-flex; }
.quiz-order-pool { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.quiz-pool-item {
  padding: 5px 12px;
  border: 1px dashed var(--line);
  border-radius: 16px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
}
.quiz-pool-item:hover { border-color: var(--accent, #4a7); }
.quiz-result { border: 1px solid var(--line); border-radius: 12px; padding: 18px; }
.quiz-review-q { padding: 10px 0; border-bottom: 1px solid var(--line); }
.quiz-review-q.ok .quiz-review-prompt::before { content: '✓ '; color: #3c8f50; }
.quiz-review-q.bad .quiz-review-prompt::before { content: '✗ '; color: #b04444; }
.quiz-review-prompt { margin: 0 0 4px; }
.quiz-review-ans { margin: 0; font-size: 13.5px; }
.quiz-result-actions { margin-top: 14px; }
.quiz-history { margin-top: 28px; border-top: 1px solid var(--line); padding-top: 14px; }
.quiz-history h2 { font-size: 16px; margin: 0 0 8px; }
.quiz-history ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.linklike { background: none; border: none; color: var(--accent, #36c); cursor: pointer; font: inherit; padding: 2px 0; text-align: left; }
</style>
