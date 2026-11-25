<script setup lang="ts">
import type { QuizSummary } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'

/** Блок «Закрепление материала» на странице темы: список проверок + действия. */
const props = withDefaults(defineProps<{ slug: string, materialId: string, editable?: boolean }>(), { editable: true })

const { data: coursePageData } = useCourseContext()
const canEdit = computed(() => coursePageData.value?.canMaterials ?? false)

const { data, refresh } = await useFetch<{ quizzes: QuizSummary[] }>(
  () => `/api/courses/${props.slug}/topics/${props.materialId}/quizzes`,
)
const quizzes = computed(() => data.value?.quizzes ?? [])

const editorOpen = ref(false)
const editing = ref<QuizSummary | null>(null)
const deleting = ref<QuizSummary | null>(null)
const resultsFor = ref<QuizSummary | null>(null)
const deleteError = ref('')

function openCreate() {
  editing.value = null
  editorOpen.value = true
}
function openEdit(q: QuizSummary) {
  editing.value = q
  editorOpen.value = true
}
async function onSaved() {
  editorOpen.value = false
  editing.value = null
  await refresh()
}
async function confirmDelete() {
  const q = deleting.value
  if (!q) return
  deleteError.value = ''
  try {
    await $fetch(`/api/courses/${props.slug}/topics/${props.materialId}/quizzes/${q.id}`, { method: 'DELETE' })
    deleting.value = null
    await refresh()
  } catch (e) {
    deleteError.value = errText(e, 'Не удалось удалить проверку')
  }
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const quizUrl = (q: QuizSummary) => `/courses/${props.slug}/topics/${props.materialId}/quizzes/${q.id}`
</script>

<template>
  <section v-if="quizzes.length || canEdit" class="quiz-section">
    <div class="quiz-head">
      <h2>Закрепление материала</h2>
      <button v-if="canEdit && editable" class="primary" @click="openCreate">Создать проверку</button>
    </div>

    <p v-if="deleteError" class="error">{{ deleteError }}</p>

    <ul v-if="quizzes.length" class="quiz-list">
      <li v-for="q in quizzes" :key="q.id" class="quiz-item">
        <div class="quiz-info">
          <NuxtLink :to="quizUrl(q)" class="quiz-title">{{ q.title }}</NuxtLink>
          <p class="muted quiz-meta">
            {{ q.questionCount }} вопр. · {{ q.totalPoints }} б. · обновлена {{ fmtDate(q.updatedAt) }}
            <template v-if="!canEdit && q.myAttempts">
              · попыток: {{ q.myAttempts }}<template v-if="q.myBestScore != null"> · лучший результат: {{ q.myBestScore }}/{{ q.totalPoints }}</template>
            </template>
          </p>
        </div>
        <div v-if="canEdit" class="quiz-actions">
          <IconBtn icon="lucide:users" label="Результаты" @click="resultsFor = q" />
          <template v-if="editable">
            <IconBtn icon="lucide:pencil" label="Редактировать" @click="openEdit(q)" />
            <IconBtn icon="lucide:trash-2" label="Удалить" danger @click="deleting = q" />
          </template>
        </div>
        <NuxtLink v-else :to="quizUrl(q)" class="btn-link">
          {{ q.myAttempts ? 'Пройти ещё раз' : 'Пройти' }}
        </NuxtLink>
      </li>
    </ul>
    <p v-else class="muted">Проверок пока нет — материал можно пройти без самопроверки.</p>

    <QuizEditorModal
      v-if="editorOpen"
      :slug="slug"
      :material-id="materialId"
      :quiz-id="editing?.id ?? null"
      @saved="onSaved"
      @close="editorOpen = false; editing = null"
    />
    <QuizResultsModal
      v-if="resultsFor"
      :slug="slug"
      :material-id="materialId"
      :quiz-id="resultsFor.id"
      :title="resultsFor.title"
      @close="resultsFor = null"
    />
    <ConfirmModal
      v-if="deleting"
      title="Удалить проверку?"
      :message="`«${deleting.title}» будет удалена вместе с ответами учеников.`"
      confirm-label="Удалить"
      danger
      @confirm="confirmDelete"
      @cancel="deleting = null"
    />
  </section>
</template>

<style scoped>
.quiz-section {
  margin-top: 28px;
  border-top: 1px solid var(--line);
  padding-top: 18px;
}
.quiz-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.quiz-head h2 { margin: 0; font-size: 18px; }
.quiz-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.quiz-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card, transparent);
  max-width: 480px;
}
.quiz-info { flex: 1; min-width: 0; }
.quiz-title { font-weight: 600; }
.quiz-meta { margin: 2px 0 0; font-size: 12.5px; }
.quiz-actions { display: flex; gap: 4px; }
.btn-link { font-size: 13.5px; white-space: nowrap; }
</style>
