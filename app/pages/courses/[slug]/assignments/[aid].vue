<script setup lang="ts">
import type { Assignment, Submission, SubmissionVersion } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'
import { onNotification } from '~/composables/useNotifications'
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

const { data: coursePageData } = useCourseContext()
const canEdit = computed(() => coursePageData.value?.canAssignments ?? false)

const assignment = computed<Assignment | null>(() => data.value?.assignment ?? null)

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const courseTitle = coursePageData.value?.course?.title ?? slug.value
  crumbs.value = assignment.value
    ? [
        { label: 'Курсы', to: '/courses' },
        { label: courseTitle, to: `/courses/${slug.value}` },
        { label: 'Задания', to: `/courses/${slug.value}/assignments` },
        { label: assignment.value.title },
      ]
    : [
        { label: 'Курсы', to: '/courses' },
        { label: courseTitle, to: `/courses/${slug.value}` },
      ]
})

// --- редактирование (учитель) ---
const editing = ref(false)
const editTab = ref<'edit' | 'preview'>('edit')
const form = reactive({
  title: '',
  due: '',
  maxPoints: null as number | null,
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
  form.due = a.due ?? ''
  form.maxPoints = a.maxPoints
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
        due: form.due || null,
        maxPoints: form.maxPoints,
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
const publishOpen = ref(false)

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
    // форма пересдачи предзаполнена текущим ответом
    answer.value = res.submission?.answer ?? ''
  } catch { /* нет доступа/не выдано — блок скрыт шаблоном */ }
}
if (!canEdit.value) void loadOwnSubmission()

const mySubmission = computed<Submission | null>(() => ownSubmission.value)
const answer = ref('')
const submitBusy = ref(false)
const submitError = ref('')

// --- редактор ответа + вложения сдачи ---
const answerTab = ref<'edit' | 'preview'>('edit')
const answerPreview = ref('')
const attachInput = ref<HTMLInputElement | null>(null)
const attachBusy = ref(false)
const { data: meData } = useFetch<{ user?: { username?: string } }>('/api/auth/me', { key: 'me' })
const myUsername = computed(() => mySubmission.value?.username ?? meData.value?.user?.username ?? '')

function attachmentUrl(username: string, name: string): string {
  return `/api/courses/${slug.value}/assignments/${aid.value}/submissions/${username}/attachments/${encodeURIComponent(name)}`
}
function attachmentsApi(username: string): string {
  return `/api/courses/${slug.value}/assignments/${aid.value}/submissions/${username}/attachments`
}
async function renderAnswerPreview() {
  try {
    const res = await $fetch<{ html: string }>('/api/md/render', {
      method: 'POST',
      body: { course: slug.value, content: answer.value },
    })
    answerPreview.value = res.html
  } catch { answerPreview.value = '' }
}
let answerPreviewTimer: ReturnType<typeof setTimeout> | null = null
watch(answer, () => {
  if (answerTab.value !== 'preview') return
  if (answerPreviewTimer) clearTimeout(answerPreviewTimer)
  answerPreviewTimer = setTimeout(renderAnswerPreview, 400)
})
async function uploadAttachment(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !myUsername.value) return
  attachBusy.value = true
  submitError.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    await $fetch(attachmentsApi(myUsername.value), { method: 'POST', body: fd })
    await loadOwnSubmission()
  } catch (err) {
    submitError.value = errText(err, 'Не удалось загрузить файл')
  } finally {
    attachBusy.value = false
  }
}
async function removeAttachment(name: string) {
  try {
    await $fetch(`${attachmentsApi(myUsername.value)}/${encodeURIComponent(name)}`, { method: 'DELETE' })
    await loadOwnSubmission()
  } catch { /* ignore */ }
}

// --- чат-обсуждение сдачи (боковая панель) ---
const { openThread: openChat, unread: chatUnreadMap, chatKey } = useSubmissionChat()
function chatUnread(c: { slug: string, aid: string, username: string }): number {
  return chatUnreadMap.value[chatKey(c)] ?? 0
}

async function submit() {
  if (!answer.value.trim()) return
  submitBusy.value = true
  submitError.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/assignments/${aid.value}/submit`, {
      method: 'POST',
      body: { answer: answer.value },
    })
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
const subsNames = ref<Record<string, string>>({})
const subsLoading = ref(false)

async function loadSubmissions() {
  if (!canEdit.value) return
  subsLoading.value = true
  try {
    const res = await $fetch<{ submissions: Submission[], names: Record<string, string> }>(
      `/api/courses/${slug.value}/assignments/${aid.value}/submissions`,
    )
    submissions.value = res.submissions
    subsNames.value = res.names
  } catch { /* список не критичен для просмотра */ } finally {
    subsLoading.value = false
  }
}

if (canEdit.value) void loadSubmissions()

// live-обновление: выдача/отзыв/сдача по этому заданию
onMounted(() => onNotification((n) => {
  if (n.course !== slug.value || !n.url.includes(`/assignments/${aid.value}`)) return
  void refresh()
  if (canEdit.value) void loadSubmissions()
  else void loadOwnSubmission()
}))

const openSub = ref<string | null>(null)
const gradeForms = reactive<Record<string, { grade: number | null, feedback: string }>>({})
const gradeBusy = ref('')
const gradeError = ref('')

// --- история версий сдачи (лениво по клику) ---
const historyFor = ref<Record<string, SubmissionVersion[]>>({})
const historyOpen = ref<Record<string, boolean>>({})
const historyLoading = ref('')

async function toggleHistory(username: string) {
  if (historyOpen.value[username]) {
    historyOpen.value = { ...historyOpen.value, [username]: false }
    return
  }
  historyOpen.value = { ...historyOpen.value, [username]: true }
  if (historyFor.value[username]) return
  historyLoading.value = username
  try {
    const res = await $fetch<{ history: SubmissionVersion[] }>(
      `/api/courses/${slug.value}/assignments/${aid.value}/submissions/${username}`,
    )
    historyFor.value = { ...historyFor.value, [username]: res.history }
  } catch {
    historyFor.value = { ...historyFor.value, [username]: [] }
  } finally {
    historyLoading.value = ''
  }
}

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
const pseudo = (u: string) => subsNames.value[u] ?? u
</script>

<template>
  <div v-if="assignment" class="course-page">
  <div class="course-content">
    <header class="page-head">
      <h1 class="page-title">{{ assignment.title }}</h1>
      <div v-if="!editing && canEdit" class="page-actions">
        <button v-if="assignment.status === 'draft'" class="small" @click="publishOpen = true">Выдать</button>
        <button class="small" @click="startEdit">Редактировать</button>
        <button class="small" :disabled="deleting" @click="removeAssignment">Удалить</button>
      </div>
      <div v-if="!editing && !canEdit && mySubmission" class="page-actions">
        <button class="small" @click="openChat({ slug, aid, username: myUsername, label: 'Ваша сдача' })">
          Обсуждение{{ chatUnread({ slug, aid, username: myUsername }) ? ` (${chatUnread({ slug, aid, username: myUsername })})` : '' }}
        </button>
      </div>
    </header>

    <p v-if="!editing" class="muted">
      <template v-if="assignment.status === 'published'">{{ typeLabel(assignment.type) }} · </template>{{ statusLabel(assignment.status) }}
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
          <h3 style="margin: 10px 0 6px;">Ваша сдача</h3>
          <pre class="answer-text">{{ mySubmission.answer }}</pre>
          <div v-if="mySubmission.attachments?.length" style="margin: 8px 0;">
            <strong>Вложения:</strong>
            <div v-for="name in mySubmission.attachments" :key="name">
              <a :href="attachmentUrl(myUsername, name)" target="_blank">{{ name }}</a>
              <button class="small" style="margin-left: 6px;" @click="removeAttachment(name)">×</button>
            </div>
          </div>
          <div class="editor-tabs" role="tablist" style="margin-top: 10px;">
            <button class="small" :class="{ active: answerTab === 'edit' }" role="tab" @click="answerTab = 'edit'">Редактор</button>
            <button class="small" :class="{ active: answerTab === 'preview' }" role="tab" @click="answerTab = 'preview'; renderAnswerPreview()">Предпросмотр</button>
          </div>
          <MdEditor
            v-if="answerTab === 'edit'"
            v-model="answer"
            language="ru-RU"
            :preview="false"
            style="margin-top: 8px;"
          />
          <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере -->
          <div v-else class="md-body" v-html="answerPreview" />
          <div class="row" style="margin-top: 10px; gap: 10px; align-items: center;">
            <input ref="attachInput" type="file" style="display: none;" @change="uploadAttachment">
            <button class="primary" :disabled="attachBusy" @click="attachInput?.click()">
              {{ attachBusy ? 'Загружаю…' : '📎 Приложить файл к сдаче' }}
            </button>
            <span class="muted" style="font-size: 12px;">до 10 МБ</span>
          </div>
          <div v-if="mySubmission.feedback" class="card" style="margin: 10px 0;">
            <strong>Комментарий учителя:</strong>
            <p style="white-space: pre-wrap;">{{ mySubmission.feedback }}</p>
          </div>
        </template>
        <template v-else>
          <div class="editor-tabs" role="tablist">
            <button class="small" :class="{ active: answerTab === 'edit' }" role="tab" @click="answerTab = 'edit'">Редактор</button>
            <button class="small" :class="{ active: answerTab === 'preview' }" role="tab" @click="answerTab = 'preview'; renderAnswerPreview()">Предпросмотр</button>
          </div>
          <MdEditor
            v-if="answerTab === 'edit'"
            v-model="answer"
            language="ru-RU"
            :preview="false"
            style="margin-top: 8px;"
          />
          <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере -->
          <div v-else class="md-body" v-html="answerPreview" />
        </template>
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
            <div v-if="s.attachments?.length" style="margin: 6px 0;">
              <strong>Вложения:</strong>
              <div v-for="name in s.attachments" :key="name">
                <a :href="attachmentUrl(s.username, name)" target="_blank">{{ name }}</a>
              </div>
            </div>

            <div style="margin-top: 8px;">
              <button class="small" @click="toggleHistory(s.username)">
                {{ historyOpen[s.username] ? 'Скрыть историю' : 'История версий' }}
              </button>
              <p v-if="historyLoading === s.username" class="muted" style="margin: 6px 0 0;">Загрузка…</p>
              <template v-else-if="historyOpen[s.username]">
                <p v-if="!historyFor[s.username]?.length" class="muted" style="margin: 6px 0 0;">
                  Предыдущих версий нет — это первая сдача.
                </p>
                <div
                  v-for="(v, i) in historyFor[s.username]"
                  :key="v.submittedAt"
                  class="card"
                  style="margin: 8px 0; padding: 12px;"
                >
                  <p class="muted" style="margin: 0 0 6px;">
                    Версия {{ i + 1 }} · сдана {{ fmtDate(v.submittedAt) }}
                    <template v-if="v.grade !== null"> · оценка: {{ v.grade }}</template>
                  </p>
                  <pre class="answer-text">{{ v.answer }}</pre>
                  <p v-if="v.feedback" style="white-space: pre-wrap; margin: 8px 0 0;">
                    <strong>Комментарий:</strong> {{ v.feedback }}
                  </p>
                </div>
              </template>
            </div>

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

            <button
              class="small"
              style="margin-top: 10px;"
              @click="openChat({ slug, aid, username: s.username, label: subsNames[s.username] ?? s.username })"
            >
              Обсуждение{{ chatUnread({ slug, aid, username: s.username }) ? ` (${chatUnread({ slug, aid, username: s.username })})` : '' }}
            </button>
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
        <div class="row" style="gap: 16px;">
          <label>
            Дедлайн
            <input v-model="form.due" type="date">
          </label>
          <label>
            Макс. баллов
            <input v-model.number="form.maxPoints" type="number" min="1" max="1000" style="width: 110px;">
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

    <PublishAssignmentModal
      v-if="publishOpen && assignment"
      :slug="slug"
      :assignment-slug="aid"
      :title="assignment.title"
      @close="publishOpen = false"
      @changed="publishOpen = false; refresh()"
    />
  </div>

  <footer v-if="editing" class="page-foot">
    <p v-if="saveError" class="error" style="margin: 0;">{{ saveError }}</p>
    <button
      class="primary"
      :disabled="saving || form.title.trim().length < 3"
      @click="save"
    >
      {{ saving ? 'Сохраняю…' : 'Сохранить' }}
    </button>
    <button @click="cancelEdit">Отмена</button>
  </footer>
  </div>
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
