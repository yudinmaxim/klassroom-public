<script setup lang="ts">
import type { Quiz, QuizQuestion, QuizQuestionType } from '#shared/types'
import { errText } from '#shared/errors'

/** Конструктор проверки «Закрепление материала» — крупная модалка. */
const props = defineProps<{ slug: string, materialId: string, quizId: string | null }>()
const emit = defineEmits<{ saved: [], close: [] }>()

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveError = ref('')

const title = ref('')
const showAnswers = ref(true)
const questions = ref<QuizQuestion[]>([])

const TYPE_LABELS: Record<QuizQuestionType, string> = {
  single: 'Один правильный',
  multi: 'Несколько правильных',
  truefalse: 'Верно / Неверно',
  fill: 'Пропуски в тексте',
  order: 'Порядок элементов',
}

let qCounter = 0
function newQuestionId() {
  return `q${Date.now().toString(36)}${(qCounter++).toString(36)}`
}
function newOptionId() {
  return `o${Date.now().toString(36)}${(qCounter++).toString(36)}`
}

function blankCount(prompt: string): number {
  let max = 0
  for (const m of prompt.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]))
  return max
}
/** Держим blanks.length = числу {{n}} в prompt. */
function syncBlanks(qu: QuizQuestion) {
  const n = blankCount(qu.prompt)
  qu.blanks = Array.from({ length: n }, (_, i) => qu.blanks?.[i] ?? { answers: [''] })
}

function resetForType(qu: QuizQuestion) {
  qu.options = undefined
  qu.correct = undefined
  qu.blanks = undefined
  qu.items = undefined
  qu.correctOrder = undefined
  if (qu.type === 'single' || qu.type === 'multi' || qu.type === 'truefalse') {
    qu.options = qu.type === 'truefalse'
      ? [{ id: newOptionId(), text: 'Верно' }, { id: newOptionId(), text: 'Неверно' }]
      : [{ id: newOptionId(), text: '' }, { id: newOptionId(), text: '' }]
    qu.correct = qu.type === 'multi' ? [] : undefined
  }
  if (qu.type === 'fill') qu.blanks = []
  if (qu.type === 'order') {
    qu.items = [{ id: newOptionId(), text: '' }, { id: newOptionId(), text: '' }]
    qu.correctOrder = []
  }
}

function addQuestion(type: QuizQuestionType) {
  const qu: QuizQuestion = { id: newQuestionId(), type, prompt: '', points: 1 }
  resetForType(qu)
  questions.value.push(qu)
}

function removeQuestion(i: number) {
  questions.value.splice(i, 1)
}
function moveQuestion(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= questions.value.length) return
  const [q] = questions.value.splice(i, 1)
  questions.value.splice(j, 0, q!)
}

function addOption(qu: QuizQuestion) {
  qu.options?.push({ id: newOptionId(), text: '' })
}
function removeOption(qu: QuizQuestion, i: number) {
  const opt = qu.options?.[i]
  qu.options?.splice(i, 1)
  if (!opt) return
  if (qu.type === 'multi' && Array.isArray(qu.correct)) {
    qu.correct = qu.correct.filter(id => id !== opt.id)
  } else if (qu.correct === opt.id) {
    qu.correct = undefined
  }
}
function isCorrect(qu: QuizQuestion, optId: string): boolean {
  if (qu.type === 'multi') return Array.isArray(qu.correct) && qu.correct.includes(optId)
  return qu.correct === optId
}
function toggleCorrect(qu: QuizQuestion, optId: string, checked: boolean) {
  if (qu.type === 'multi') {
    const cur = Array.isArray(qu.correct) ? [...qu.correct] : []
    qu.correct = checked ? [...cur, optId] : cur.filter(id => id !== optId)
  } else {
    qu.correct = checked ? optId : undefined
  }
}

/** fill: ответы пропуска — строки через запятую → массив. */
function blankAnswers(qu: QuizQuestion, i: number): string {
  return (qu.blanks?.[i]?.answers ?? []).join(', ')
}
function setBlankAnswers(qu: QuizQuestion, i: number, v: string) {
  syncBlanks(qu)
  qu.blanks![i]!.answers = v.split(',').map(s => s.trim()).filter(Boolean)
}

/** order: items в правильном порядке (учитель перечисляет верно). */
function syncOrder(qu: QuizQuestion) {
  qu.correctOrder = (qu.items ?? []).map(it => it.id)
}

const canSave = computed(() =>
  title.value.trim().length > 0
  && questions.value.length > 0
  && questions.value.every(q =>
    q.prompt.trim().length > 0
    && q.points > 0
    && (q.type === 'fill'
      ? blankCount(q.prompt) > 0 && (q.blanks ?? []).every(b => b.answers.length > 0)
      : q.type === 'order'
        ? (q.items ?? []).filter(i => i.text.trim()).length >= 2
        : (q.options ?? []).filter(o => o.text.trim()).length >= 2
          && (q.type === 'multi' ? (Array.isArray(q.correct) ? q.correct.length > 0 : false) : !!q.correct)),
  ),
)

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    // чистим пустые варианты/элементы перед отправкой
    const clean = questions.value.map(q => {
      const out: QuizQuestion = { ...q }
      if (out.options) out.options = out.options.filter(o => o.text.trim())
      if (out.items) {
        out.items = out.items.filter(i => i.text.trim())
        out.correctOrder = out.items.map(i => i.id)
      }
      if (out.blanks) {
        out.blanks = out.blanks.map(b => ({ answers: b.answers.filter(a => a.trim()) }))
      }
      return out
    })
    const body = { title: title.value.trim(), showAnswers: showAnswers.value, questions: clean }
    if (props.quizId) {
      await $fetch(`/api/courses/${props.slug}/topics/${props.materialId}/quizzes/${props.quizId}`, {
        method: 'PATCH',
        body,
      })
    } else {
      await $fetch(`/api/courses/${props.slug}/topics/${props.materialId}/quizzes`, {
        method: 'POST',
        body,
      })
    }
    emit('saved')
  } catch (e) {
    saveError.value = errText(e, 'Не удалось сохранить проверку')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    if (props.quizId) {
      const { quiz } = await $fetch<{ quiz: Quiz }>(
        `/api/courses/${props.slug}/topics/${props.materialId}/quizzes/${props.quizId}`,
      )
      title.value = quiz.title
      showAnswers.value = quiz.showAnswers
      questions.value = quiz.questions.map(q => ({ ...q }))
    }
  } catch (e) {
    loadError.value = errText(e, 'Не удалось загрузить проверку')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <BaseModal
    title="Конструктор проверки"
    width="min(960px, 94vw)"
    height="min(860px, 90vh)"
    @close="emit('close')"
  >
    <div v-if="loading" class="muted" style="padding: 20px;">Загрузка…</div>
    <div v-else-if="loadError" class="error" style="padding: 20px;">{{ loadError }}</div>
    <div v-else class="quiz-builder">
      <div class="qb-meta">
        <label class="qb-title-field">
          Название проверки
          <input v-model="title" maxlength="120" placeholder="Например: Проверка по теме">
        </label>
        <label class="check qb-show">
          <input v-model="showAnswers" type="checkbox">
          Показывать правильные ответы после проверки
        </label>
      </div>

      <div class="qb-questions">
        <div v-for="(qu, qi) in questions" :key="qu.id" class="qb-question">
          <div class="qb-q-head">
            <span class="qb-q-num">Вопрос {{ qi + 1 }}</span>
            <select v-model="qu.type" class="qb-type" @change="resetForType(qu)">
              <option v-for="(label, t) in TYPE_LABELS" :key="t" :value="t">{{ label }}</option>
            </select>
            <label class="qb-points">Баллы <input v-model.number="qu.points" type="number" min="0.5" step="0.5" style="width: 64px;"></label>
            <span class="qb-q-tools">
              <IconBtn icon="lucide:arrow-up" label="Выше" :disabled="qi === 0" @click="moveQuestion(qi, -1)" />
              <IconBtn icon="lucide:arrow-down" label="Ниже" :disabled="qi === questions.length - 1" @click="moveQuestion(qi, 1)" />
              <IconBtn icon="lucide:trash-2" label="Удалить вопрос" danger @click="removeQuestion(qi)" />
            </span>
          </div>

          <textarea
            v-model="qu.prompt"
            class="qb-prompt"
            rows="2"
            :placeholder="qu.type === 'fill' ? 'Текст вопроса. Пропуски — {{1}}, {{2}}…' : 'Текст вопроса (markdown)'"
            @input="qu.type === 'fill' && syncBlanks(qu)"
          />

          <!-- single / multi / truefalse -->
          <div v-if="['single', 'multi', 'truefalse'].includes(qu.type)" class="qb-options">
            <div v-for="(opt, oi) in qu.options" :key="opt.id" class="qb-option">
              <input
                :type="qu.type === 'multi' ? 'checkbox' : 'radio'"
                :name="`q-${qu.id}`"
                :checked="isCorrect(qu, opt.id)"
                @change="toggleCorrect(qu, opt.id, ($event.target as HTMLInputElement).checked)"
              >
              <input v-model="opt.text" class="qb-option-text" placeholder="Вариант ответа">
              <IconBtn icon="lucide:x" label="Убрать вариант" @click="removeOption(qu, oi)" />
            </div>
            <button v-if="qu.type !== 'truefalse'" class="qb-add" @click="addOption(qu)">+ вариант</button>
          </div>

          <!-- fill -->
          <div v-else-if="qu.type === 'fill'" class="qb-blanks">
            <p v-if="!blankCount(qu.prompt)" class="muted" style="margin: 4px 0;">
              Добавьте в текст пропуски вида {{ '{' }}{{ '{' }}1{{ '}' }}{{ '}' }}, {{ '{' }}{{ '{' }}2{{ '}' }}{{ '}' }}…
            </p>
            <label v-for="(b, bi) in qu.blanks ?? []" :key="bi" class="qb-blank">
              Пропуск {{ bi + 1 }} — принимаемые ответы (через запятую)
              <input :value="blankAnswers(qu, bi)" placeholder="ответ, ещё ответ" @input="setBlankAnswers(qu, bi, ($event.target as HTMLInputElement).value)">
            </label>
          </div>

          <!-- order -->
          <div v-else class="qb-order">
            <p class="muted" style="margin: 4px 0;">Перечислите элементы в правильном порядке — ученик увидит их перемешанными.</p>
            <div v-for="(it, ii) in qu.items" :key="it.id" class="qb-option">
              <span class="qb-order-num">{{ ii + 1 }}</span>
              <input v-model="it.text" class="qb-option-text" placeholder="Элемент">
              <IconBtn icon="lucide:x" label="Убрать элемент" @click="qu.items?.splice(ii, 1); syncOrder(qu)" />
            </div>
            <div class="qb-order-tools">
              <button class="qb-add" @click="qu.items?.push({ id: newOptionId(), text: '' }); syncOrder(qu)">+ элемент</button>
            </div>
          </div>
        </div>
      </div>

      <div class="qb-addbar">
        <span class="muted" style="margin-right: 8px;">Добавить вопрос:</span>
        <button v-for="(label, t) in TYPE_LABELS" :key="t" class="qb-add" @click="addQuestion(t)">{{ label }}</button>
      </div>

      <p v-if="saveError" class="error">{{ saveError }}</p>
    </div>

    <template #foot>
      <button :disabled="saving || !canSave" class="primary" @click="save">
        {{ saving ? 'Сохраняю…' : 'Сохранить' }}
      </button>
      <button @click="emit('close')">Отмена</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.quiz-builder {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.qb-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 12px 4px;
  border-bottom: 1px solid var(--line);
}
.qb-title-field { flex: 0 1 480px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.qb-show { display: flex; align-items: center; gap: 6px; font-size: 13px; white-space: nowrap; flex: none; }
.qb-questions {
  flex: 1;
  overflow-y: auto;
  padding: 10px 2px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.qb-question {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
}
.qb-q-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.qb-q-num { font-weight: 600; font-size: 13px; }
.qb-type { font-size: 13px; }
.qb-points { font-size: 13px; display: flex; align-items: center; gap: 4px; }
.qb-q-tools { margin-left: auto; display: flex; gap: 2px; }
.qb-prompt {
  width: 100%;
  resize: vertical;
  font: inherit;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  color: inherit;
}
.qb-options, .qb-blanks, .qb-order { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.qb-option { display: flex; align-items: center; gap: 8px; }
.qb-option-text { flex: 1; }
.qb-blank { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.qb-order-num {
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
.qb-addbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 2px;
  border-top: 1px solid var(--line);
}
.qb-add {
  font-size: 12.5px;
  padding: 5px 10px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.qb-add:hover { border-color: var(--accent, #4a7); }
</style>
