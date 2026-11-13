<script setup lang="ts">
import type { Assignment, Submission } from '#shared/types'
import { errText } from '#shared/errors'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const aid = computed(() => String(route.params.aid))

const { data, refresh, error: loadError } = await useFetch(
  `/api/courses/${slug.value}/assignments/${aid.value}`,
)
if (loadError.value) {
  throw createError({ statusCode: 404, message: 'Задание не найдено', fatal: true })
}

const { data: courseData } = await useFetch(`/api/courses/${slug.value}`)
const canEdit = computed(() => courseData.value?.canAssignments ?? false)
const roster = computed(() => courseData.value?.roster ?? [])
const rosterNames = computed(() => new Map(roster.value.map(s => [s.username, s.pseudonym])))

const assignment = computed<Assignment | null>(() => data.value?.assignment ?? null)

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const courseTitle = courseData.value?.course?.title ?? slug.value
  crumbs.value = assignment.value
    ? [
        { label: 'Курсы', to: '/' },
        { label: courseTitle, to: `/courses/${slug.value}` },
        { label: 'Задания', to: `/courses/${slug.value}?tab=assignments` },
        { label: assignment.value.title },
      ]
    : [
        { label: 'Курсы', to: '/' },
        { label: courseTitle, to: `/courses/${slug.value}` },
      ]
})

// --- редактирование (учитель) ---
const editing = ref(false)
const editTab = ref<'edit' | 'preview'>('edit')
const form = reactive({
  title: '',
  type: 'general' as 'general' | 'private',
  audience: [] as string[],
  due: '',
  maxPoints: null as number | null,
  status: 'draft' as 'draft' | 'published',
  description: '',
})
const preview = ref('')

const toolbars = [
  'bold', 'underline', 'italic', 'strikeThrough', '-',
  'title', 'unorderedList', 'orderedList', 'task', 'quote', '-',
  'codeRow', 'code', 'link', 'image', 'table', '-',
  'revoke', 'next',
]

function startEdit() {
  const a = assignment.value
  if (!a) return
  form.title = a.title
  form.type = a.type
  form.audience = [...a.audience]
  form.due = a.due ?? ''
  form.maxPoints = a.maxPoints
  form.status = a.status
  form.description = a.description
  preview.value = a.html
  editTab.value = 'edit'
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

if (route.query.edit === '1' && canEdit.value) startEdit()

async function renderPreview() {
  try {
    const res = await $fetch<{ html: string }>('/api/md/render', {
      method: 'POST',
      body: { course: slug.value, content: form.description },
    })
    preview.value = res.html
  } catch { /* превью не критично */ }
}

let previewTimer: ReturnType<typeof setTimeout> | null = null
watch(() => form.description, () => {
  if (!editing.value) return
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(renderPreview, 400)
})

const saveError = ref('')
const saving = ref(false)

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/assignments/${aid.value}`, {
      method: 'PATCH',
      body: {
        title: form.title,
        type: form.type,
        audience: form.type === 'private' ? form.audience : [],
        due: form.due || null,
        maxPoints: form.maxPoints,
        status: form.status,
        description: form.description,
      },
    })
    editing.value = false
    await refresh()
    await loadSubmissions()
  } catch (e) {
    saveError.value = errText(e, 'Не удалось сохранить задание')
  } finally {
    saving.value = false
  }
}

const deleting = ref(false)
async function removeAssignment() {
  if (!window.confirm('Удалить задание вместе со всеми сдачами?')) return
  deleting.value = true
  try {
    await $fetch(`/api/courses/${slug.value}/assignments/${aid.value}`, { method: 'DELETE' })
    await navigateTo(`/courses/${slug.value}`)
  } catch (e) {
    saveError.value = errText(e, 'Не удалось удалить задание')
    deleting.value = false
  }
}

// --- сдача ученика ---
const ownSubmission = ref<Submission | null>(null)

async function loadOwnSubmission() {
  if (canEdit.value) return
  try {
    const res = await $fetch<{ submission: Submission | null }>(
      `/api/courses/${slug.value}/assignments/${aid.value}/submit`,
    )
    ownSubmission.value = res.submission
  } catch { /* нет доступа/не выдано — блок скрыт шаблоном */ }
}
if (!canEdit.value) void loadOwnSubmission()

const mySubmission = computed<Submission | null>(() => ownSubmission.value)
const answer = ref('')
const submitBusy = ref(false)
const submitError = ref('')

async function submit() {
  if (!answer.value.trim()) return
  submitBusy.value = true
  submitError.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/assignments/${aid.value}/submit`, {
      method: 'POST',
      body: { answer: answer.value },
    })
    answer.value = ''
    await refresh()
    await loadOwnSubmission()
  } catch (e) {
    submitError.value = errText(e, 'Не удалось сдать работу')
  } finally {
    submitBusy.value = false
  }
}

// --- сдачи (учитель) ---
const submissions = ref<Submission[]>([])
const subsLoading = ref(false)

async function loadSubmissions() {
  if (!canEdit.value) return
  subsLoading.value = true
  try {
    const res = await $fetch<{ submissions: Submission[] }>(
      `/api/courses/${slug.value}/assignments/${aid.value}/submissions`,
    )
    submissions.value = res.submissions
  } catch { /* список не критичен для просмотра */ } finally {
    subsLoading.value = false
  }
}

if (canEdit.value) void loadSubmissions()

const openSub = ref<string | null>(null)
const gradeForms = reactive<Record<string, { grade: number | null, feedback: string }>>({})
const gradeBusy = ref('')
const gradeError = ref('')

function toggleSub(username: string) {
  openSub.value = openSub.value === username ? null : username
  if (!gradeForms[username]) {
    const s = submissions.value.find(x => x.username === username)
    gradeForms[username] = { grade: s?.grade ?? null, feedback: s?.feedback ?? '' }
  }
}

async function grade(username: string) {
  gradeBusy.value = username
  gradeError.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/assignments/${aid.value}/grade/${username}`, {
      method: 'POST',
      body: gradeForms[username],
    })
    await loadSubmissions()
    await refresh()
  } catch (e) {
    gradeError.value = errText(e, 'Не удалось сохранить оценку')
  } finally {
    gradeBusy.value = ''
  }
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const typeLabel = (t: string) => (t === 'private' ? 'частное' : 'общее')
const statusLabel = (s: string) => (s === 'published' ? 'Выдано' : 'Не выдано')
const subStatusLabel = (s: string) =>
  ({ submitted: 'на проверке', returned: 'проверено' })[s] ?? s
const pseudo = (u: string) => rosterNames.value.get(u) ?? u
</script>

<template>
  <PageShell v-if="assignment" :show-foot="editing">
    <template #title>{{ assignment.title }}</template>
    <template #actions>
      <template v-if="!editing && canEdit">
        <button class="small" @click="startEdit">Редактировать</button>
        <button class="small" :disabled="deleting" @click="removeAssignment">Удалить</button>
      </template>
    </template>

    <p v-if="!editing" class="muted">
      {{ typeLabel(assignment.type) }} ·
      {{ statusLabel(assignment.status) }}
      <template v-if="assignment.due"> · до {{ assignment.due }}</template>
      <template v-if="assignment.maxPoints"> · {{ assignment.maxPoints }} балл.</template>
      · обновлено {{ fmtDate(assignment.updatedAt) }}
    </p>
    <p v-if="assignment.type === 'private' && assignment.audience.length" class="muted">
      Для: {{ assignment.audience.map(pseudo).join(', ') }}
    </p>

    <!-- Просмотр -->
    <div v-if="!editing">
      <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере -->
      <div class="md-body" v-html="assignment.html" />

      <!-- Сдача ученика -->
      <div v-if="!canEdit && assignment.status === 'published'" style="margin-top: 22px; border-top: 1px solid var(--line); padding-top: 16px;">
        <h2>Ваш ответ</h2>
        <template v-if="mySubmission">
          <p class="muted">
            Статус: {{ subStatusLabel(mySubmission.status) }}
            <template v-if="mySubmission.grade !== null"> · оценка: {{ mySubmission.grade }}</template>
            · сдано {{ fmtDate(mySubmission.submittedAt) }}
          </p>
          <div v-if="mySubmission.feedback" class="card" style="margin-bottom: 10px;">
            <strong>Комментарий учителя:</strong>
            <p style="white-space: pre-wrap;">{{ mySubmission.feedback }}</p>
          </div>
        </template>
        <label>
          Ответ (markdown)
          <textarea v-model="answer" rows="8" placeholder="Напишите ответ…" />
        </label>
        <p v-if="submitError" class="error">{{ submitError }}</p>
        <button class="primary" style="margin-top: 8px;" :disabled="submitBusy || !answer.trim()" @click="submit">
          {{ submitBusy ? 'Отправляю…' : mySubmission ? 'Пересдать' : 'Сдать' }}
        </button>
      </div>
      <p v-else-if="!canEdit" class="muted" style="margin-top: 22px;">
        Задание {{ statusLabel(assignment.status).toLowerCase() }}.
      </p>

      <!-- Сдачи учителя -->
      <div v-if="canEdit" style="margin-top: 22px; border-top: 1px solid var(--line); padding-top: 16px;">
        <h2>Сдачи ({{ submissions.length }})</h2>
        <p v-if="subsLoading" class="muted">Загрузка…</p>
        <p v-else-if="!submissions.length" class="muted">Сдач пока нет.</p>
        <div v-for="s in submissions" :key="s.username" class="card" style="margin-bottom: 10px;">
          <div class="row" style="justify-content: space-between;">
            <div>
              <strong>{{ pseudo(s.username) }}</strong>
              <span class="muted"> · {{ s.username }}</span>
            </div>
            <div class="row" style="gap: 10px;">
              <span class="muted">{{ subStatusLabel(s.status) }}</span>
              <span v-if="s.grade !== null"><strong>{{ s.grade }}</strong></span>
              <button class="small" @click="toggleSub(s.username)">
                {{ openSub === s.username ? 'Скрыть' : 'Открыть' }}
              </button>
            </div>
          </div>
          <div v-if="openSub === s.username" style="margin-top: 10px;">
            <p class="muted">Сдано {{ fmtDate(s.submittedAt) }}<template v-if="s.updatedAt"> · обновлено {{ fmtDate(s.updatedAt) }}</template></p>
            <pre class="answer-text">{{ s.answer }}</pre>
            <div class="form" style="margin-top: 10px;">
              <label>
                Оценка
                <input
                  v-model.number="gradeForms[s.username].grade"
                  type="number"
                  min="0"
                  :max="assignment.maxPoints ?? 1000"
                >
              </label>
              <label>
                Комментарий
                <textarea v-model="gradeForms[s.username].feedback" rows="3" />
              </label>
              <button class="primary" :disabled="gradeBusy === s.username" @click="grade(s.username)">
                {{ gradeBusy === s.username ? 'Сохраняю…' : 'Оценить и вернуть' }}
              </button>
            </div>
          </div>
        </div>
        <p v-if="gradeError" class="error">{{ gradeError }}</p>
      </div>
    </div>

    <!-- Редактирование -->
    <div v-if="editing" style="margin-top: 14px;">
      <div class="editor-tabs" role="tablist">
        <button class="small" :class="{ active: editTab === 'edit' }" role="tab" @click="editTab = 'edit'">Редактор</button>
        <button class="small" :class="{ active: editTab === 'preview' }" role="tab" @click="editTab = 'preview'; renderPreview()">Предпросмотр</button>
      </div>

      <div v-if="editTab === 'edit'" class="form">
        <label>
          Название
          <input v-model="form.title">
        </label>
        <label>
          Тип
          <select v-model="form.type">
            <option value="general">Общее (весь курс)</option>
            <option value="private">Частное (выбранным ученикам)</option>
          </select>
        </label>
        <div v-if="form.type === 'private'">
          <span class="muted" style="display:block; margin-bottom: 4px;">Ученики:</span>
          <label v-for="s in roster" :key="s.username" class="row" style="gap: 6px;">
            <input v-model="form.audience" type="checkbox" :value="s.username">
            {{ s.pseudonym }} <span class="muted">({{ s.username }})</span>
          </label>
          <p v-if="!form.audience.length" class="muted" style="margin: 6px 0 0;">
            Для частного задания выберите хотя бы одного ученика.
          </p>
        </div>
        <div class="row" style="gap: 16px;">
          <label>
            Дедлайн
            <input v-model="form.due" type="date">
          </label>
          <label>
            Макс. баллов
            <input v-model.number="form.maxPoints" type="number" min="1" max="1000" style="width: 110px;">
          </label>
          <label>
            Статус
            <select v-model="form.status">
              <option value="draft">Не выдано</option>
              <option value="published">Выдано</option>
            </select>
          </label>
        </div>
        <div class="md-editor-wrap" style="margin-top: 10px;">
          <MdEditor
            id="wikiroom-assignment-editor"
            v-model="form.description"
            language="en-US"
            :preview="false"
            :toolbars="toolbars"
          />
        </div>
      </div>
      <div v-else>
        <!-- eslint-disable-next-line vue/no-v-html -- серверный санитизированный рендер -->
        <div class="md-body" v-html="preview" />
      </div>
    </div>

    <template #foot>
      <p v-if="saveError && editing" class="error" style="margin: 0;">{{ saveError }}</p>
      <button
        v-if="editing"
        class="primary"
        :disabled="saving || form.title.trim().length < 3 || (form.type === 'private' && !form.audience.length)"
        @click="save"
      >
        {{ saving ? 'Сохраняю…' : 'Сохранить' }}
      </button>
      <button v-if="editing" @click="cancelEdit">Отмена</button>
    </template>
  </PageShell>
</template>

<style scoped>
.answer-text {
  white-space: pre-wrap;
  background: var(--bg-soft, #f6f6f6);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  max-height: 320px;
  overflow: auto;
  font-size: 14px;
}
</style>
