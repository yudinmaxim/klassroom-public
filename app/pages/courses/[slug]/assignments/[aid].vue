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
        { label: 'Курсы', to: '/' },
        { label: courseTitle, to: `/courses/${slug.value}` },
        { label: 'Задания', to: `/courses/${slug.value}/assignments` },
        { label: assignment.value.title },
      ]
    : [
        { label: 'Курсы', to: '/' },
        { label: courseTitle, to: `/courses/${slug.value}` },
      ]
})

// --- редактирование (учитель) ---
const editing = ref(false)
const form = reactive({
  title: '',
  due: '',
  maxPoints: null as number | null,
  description: '',
  allowResubmit: true,
})

function startEdit() {
  const a = assignment.value
  if (!a) return
  form.title = a.title
  form.due = a.due ?? ''
  form.maxPoints = a.maxPoints
  form.description = a.description
  form.allowResubmit = a.allowResubmit
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

if (route.query.edit === '1' && canEdit.value) startEdit()

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
        allowResubmit: form.allowResubmit,
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
const studentStatusTitle = computed(() => {
  const s = mySubmission.value
  if (!s) return 'Вы не сдавали работу'
  return s.status === 'returned' ? 'Проверено' : 'Вы сдали на проверку'
})
const answer = ref('')
const submitBusy = ref(false)
const submitError = ref('')

// --- редактор ответа + вложения сдачи ---
const attachBusy = ref(false)
const { data: meData } = useFetch<{ user?: { username?: string } }>('/api/auth/me', { key: 'me' })
const myUsername = computed(() => mySubmission.value?.username ?? meData.value?.user?.username ?? '')

function attachmentUrl(username: string, name: string): string {
  return `/api/courses/${slug.value}/assignments/${aid.value}/submissions/${username}/attachments/${encodeURIComponent(name)}`
}
function historyAttachmentUrl(username: string, file: string, name: string): string {
  return `/api/courses/${slug.value}/assignments/${aid.value}/submissions/${username}/history/${file}/attachments/${encodeURIComponent(name)}`
}
function attachmentsApi(username: string): string {
  return `/api/courses/${slug.value}/assignments/${aid.value}/submissions/${username}/attachments`
}
async function uploadAttachment(file: File) {
  if (!myUsername.value) return
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
    gradeForms[username] = { grade: null, feedback: '' }
  }
}

// «Оценить» активна только при заполненных оценке и комментарии
function gradeReady(username: string): boolean {
  const f = gradeForms[username]
  return !!f && typeof f.grade === 'number' && String(f.feedback).trim() !== ''
}

// --- правило пересдачи: общее на задании + переопределения per-student ---
const resubmitBusy = ref('')
const RESUBMIT_STATES = ['', 'allow', 'deny'] as const
type ResubmitState = (typeof RESUBMIT_STATES)[number]

function resubmitOverrideOf(username: string): ResubmitState {
  const v = assignment.value?.resubmitOverrides?.[username]
  return v === undefined ? '' : v ? 'allow' : 'deny'
}

function resubmitStateLabel(username: string): string {
  const o = resubmitOverrideOf(username)
  if (o === 'allow') return 'разрешена'
  if (o === 'deny') return 'запрещена'
  return `по умолчанию (${assignment.value?.allowResubmit ? 'разрешена' : 'запрещена'})`
}

async function cycleResubmit(username: string) {
  const cur = resubmitOverrideOf(username)
  const next = RESUBMIT_STATES[(RESUBMIT_STATES.indexOf(cur) + 1) % RESUBMIT_STATES.length]
  resubmitBusy.value = username
  gradeError.value = ''
  try {
    await $fetch(
      `/api/courses/${slug.value}/assignments/${aid.value}/submissions/${username}/resubmit`,
      { method: 'PATCH', body: { allowed: next === '' ? null : next === 'allow' } },
    )
    await refresh()
  } catch (err) {
    gradeError.value = errText(err, 'Не удалось изменить правило пересдачи')
  } finally {
    resubmitBusy.value = ''
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

const fmtDate = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}
// «Сдано X · обновлено Y» — пустые/битые даты пропускаются
function datesLabel(submittedAt: string | null, updatedAt?: string | null): string {
  const parts: string[] = []
  const s = fmtDate(submittedAt)
  if (s) parts.push(`Сдано ${s}`)
  const u = fmtDate(updatedAt ?? null)
  if (u) parts.push(`обновлено ${u}`)
  return parts.join(' · ')
}
const typeLabel = (t: string) => (t === 'private' ? 'частное' : 'общее')
const statusLabel = (s: string) => (s === 'published' ? 'Выдано' : 'Не выдано')
const subStatusLabel = (s: string) =>
  ({ submitted: 'На проверке', returned: 'Проверено' })[s] ?? s
const pseudo = (u: string) => subsNames.value[u] ?? u
</script>

<template>
  <div v-if="assignment" class="course-page">
  <div class="course-content">
    <header class="page-head">
      <h1 class="page-title">{{ assignment.title }}</h1>
      <div v-if="!editing && canEdit" class="page-actions">
        <button v-if="assignment.status === 'draft'" class="small" @click="publishOpen = true">Выдать</button>
        <span class="tip">
          <button class="icon-btn" aria-label="Редактировать задание" @click="startEdit">
            <Icon name="lucide:pencil" />
          </button>
          <span class="tip-body">Редактировать</span>
        </span>
        <span class="tip">
          <button class="icon-btn danger" aria-label="Удалить задание" :disabled="deleting" @click="removeAssignment">
            <Icon name="lucide:trash-2" />
          </button>
          <span class="tip-body">Удалить</span>
        </span>
      </div>
      <div v-if="!editing && !canEdit && mySubmission" class="page-actions">
        <button class="small chat-btn" @click="openChat({ slug, aid, username: myUsername, label: 'Ваша сдача' })">
          Обсуждение
          <span v-if="chatUnread({ slug, aid, username: myUsername })" class="unread-dot" />
        </button>
      </div>
    </header>

    <p v-if="!editing" class="muted">
      <template v-if="assignment.status === 'published'">{{ typeLabel(assignment.type) }} · </template>{{ statusLabel(assignment.status) }}
      <template v-if="assignment.due"> · до {{ assignment.due }}</template>
      <template v-if="assignment.maxPoints"> · {{ assignment.maxPoints }} балл.</template>
      <template v-if="fmtDate(assignment.updatedAt)"> · обновлено {{ fmtDate(assignment.updatedAt) }}</template>
    </p>
    <!-- Просмотр -->
    <div v-if="!editing">
      <h2>Задание</h2>
      <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере -->
      <div class="md-body" v-html="assignment.html" />

      <!-- Сдача ученика -->
      <div v-if="!canEdit && assignment.status === 'published'" style="margin-top: 22px; border-top: 1px solid var(--line); padding-top: 16px;">
        <h2>{{ studentStatusTitle }}</h2>
        <template v-if="mySubmission">
          <p class="muted">
            <template v-if="mySubmission.grade !== null">Оценка: <strong>{{ mySubmission.grade }}</strong> · </template><template v-if="fmtDate(mySubmission.submittedAt)">Сдано {{ fmtDate(mySubmission.submittedAt) }}</template>
          </p>
          <div class="card" style="margin: 10px 0;">
            <strong>Ваш ответ:</strong>
            <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере -->
            <div class="md-body" style="margin: 6px 0 0; font-size: 14px;" v-html="mySubmission.html" />
            <div v-if="mySubmission.feedback" class="card card-nested">
              <strong>Комментарий учителя:</strong>
              <p style="white-space: pre-wrap; margin: 6px 0 0;">{{ mySubmission.feedback }}</p>
            </div>
          </div>
          <template v-if="assignment.canResubmit">
            <h3 style="margin: 14px 0 8px;">Ответ на задание</h3>
            <div class="md-editor-wrap sm">
              <MdEditor
                v-model="answer"
                language="en-US"
                :toolbars="MD_TOOLBARS"
              />
            </div>
            <div class="row" style="margin-top: 10px; gap: 10px; align-items: center;">
              <AttachmentField
                :items="mySubmission?.attachments ?? []"
                :busy="attachBusy"
                :link-for="(n: string) => attachmentUrl(myUsername, n)"
                @upload="uploadAttachment"
                @remove="removeAttachment"
              />
              <span class="muted" style="font-size: 12px;">до 10 МБ</span>
            </div>
          </template>
          <p v-else class="muted" style="margin-top: 10px;">
            Пересдача запрещена — преподаватель не разрешил сдавать работу повторно.
          </p>
        </template>
        <template v-else>
          <h3 style="margin: 14px 0 8px;">Ответ на задание</h3>
          <div class="md-editor-wrap sm">
            <MdEditor
              v-model="answer"
              language="en-US"
              :toolbars="MD_TOOLBARS"
            />
          </div>
        </template>
        <p v-if="submitError" class="error">{{ submitError }}</p>
        <button
          v-if="!mySubmission || assignment.canResubmit"
          class="primary"
          style="margin-top: 8px;"
          :disabled="submitBusy || !answer.trim()"
          @click="submit"
        >
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
          <div class="row sub-head" style="justify-content: space-between;" @click="toggleSub(s.username)">
            <div>
              <strong>{{ pseudo(s.username) }}</strong>
              <span class="muted"> · {{ s.username }}</span>
            </div>
            <div class="row" style="gap: 10px;">
              <span v-if="openSub !== s.username && datesLabel(s.submittedAt, s.updatedAt)" class="muted">
                {{ datesLabel(s.submittedAt, s.updatedAt) }}
              </span>
              <span class="muted">{{ subStatusLabel(s.status) }}</span>
              <span v-if="s.grade !== null"><strong>{{ s.grade }}</strong></span>
              <button
                class="small chat-btn"
                @click.stop="openChat({ slug, aid, username: s.username, label: pseudo(s.username) })"
              >
                Обсуждение
                <span v-if="chatUnread({ slug, aid, username: s.username })" class="unread-dot" />
              </button>
              <Icon
                :name="openSub === s.username ? 'lucide:chevron-down' : 'lucide:chevron-right'"
                class="sub-caret"
              />
            </div>
          </div>
          <div v-if="openSub === s.username" style="margin-top: 10px;">
            <!-- Текущая версия сдачи -->
            <div class="sub-answer">
              <div class="row sub-meta">
                <strong>Ответ учащегося</strong>
                <span class="muted">
                  <template v-if="datesLabel(s.submittedAt, s.updatedAt)">{{ datesLabel(s.submittedAt, s.updatedAt) }} · </template>{{ subStatusLabel(s.status) }}<template v-if="s.grade !== null"> · оценка: <strong>{{ s.grade }}</strong></template>
                </span>
              </div>
              <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере -->
              <div class="md-body sub-body" v-html="s.html" />
              <FileChips
                v-if="s.attachments?.length"
                :files="s.attachments"
                :href-for="(n: string) => attachmentUrl(s.username, n)"
              />
              <div v-if="s.feedback" class="card card-nested">
                <strong>Комментарий учителя:</strong>
                <p class="sub-body-sm">{{ s.feedback }}</p>
              </div>
            </div>

            <!-- История версий — как диалог -->
            <div style="margin-top: 12px;">
              <button class="small" @click="toggleHistory(s.username)">
                {{ historyOpen[s.username] ? 'Скрыть историю' : 'Показать историю' }}
                <template v-if="historyFor[s.username]?.length"> ({{ historyFor[s.username].length }})</template>
              </button>
              <p v-if="historyLoading === s.username" class="muted" style="margin: 6px 0 0;">Загрузка…</p>
              <p v-else-if="historyOpen[s.username] && !historyFor[s.username]?.length" class="muted" style="margin: 6px 0 0;">
                Предыдущих версий нет — это первая сдача.
              </p>
              <div v-else-if="historyOpen[s.username]" class="sub-history">
                <div
                  v-for="(v, i) in historyFor[s.username]"
                  :key="v.submittedAt"
                  class="sub-version"
                >
                  <div class="row sub-meta">
                    <strong>Версия {{ i + 1 }}</strong>
                    <span class="muted">
                      <template v-if="fmtDate(v.submittedAt)">{{ fmtDate(v.submittedAt) }} · </template><template v-if="v.grade !== null">оценка: <strong>{{ v.grade }}</strong></template>
                    </span>
                  </div>
                  <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере -->
                  <div class="md-body sub-body" v-html="v.html" />
                  <FileChips
                    v-if="v.attachments.length"
                    :files="v.attachments"
                    :href-for="(n: string) => historyAttachmentUrl(s.username, v.file, n)"
                  />
                  <div v-if="v.feedback" class="card card-nested">
                    <strong>Комментарий учителя:</strong>
                    <p class="sub-body-sm">{{ v.feedback }}</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="form" style="margin-top: 20px;">
              <div class="row">
                <label style="display: flex; align-items: center; gap: 8px;">
                  Оценка
                  <input
                    v-model.number="gradeForms[s.username].grade"
                    type="number"
                    min="0"
                    :max="assignment.maxPoints ?? 1000"
                    style="width: 90px; flex: none;"
                  >
                </label>
                <label
                  class="check"
                  title="Клик переключает: по умолчанию → разрешена → запрещена"
                >
                  <input
                    type="checkbox"
                    :checked="resubmitOverrideOf(s.username) === 'allow'"
                    :indeterminate.prop="resubmitOverrideOf(s.username) === ''"
                    :disabled="resubmitBusy === s.username"
                    @click.prevent="cycleResubmit(s.username)"
                  >
                  <span>
                    Пересдача
                    <span class="muted">— {{ resubmitStateLabel(s.username) }}</span>
                  </span>
                </label>
              </div>
              <label>
                Комментарий
                <textarea v-model="gradeForms[s.username].feedback" rows="3" />
              </label>
              <button
                class="primary"
                :disabled="gradeBusy === s.username || !gradeReady(s.username)"
                :title="gradeReady(s.username) ? '' : 'Заполните оценку и комментарий'"
                @click="grade(s.username)"
              >
                {{ gradeBusy === s.username ? 'Сохраняю…' : 'Оценить' }}
              </button>
            </div>
          </div>
        </div>
        <p v-if="gradeError" class="error">{{ gradeError }}</p>
      </div>
    </div>

    <!-- Редактирование -->
    <div v-if="editing" style="margin-top: 14px;">
      <div class="form">
        <label>
          Название
          <input v-model="form.title">
        </label>
        <div class="row" style="gap: 16px;">
          <label>
            Дата сдачи
            <input v-model="form.due" type="date">
          </label>
          <label>
            Макс. баллов
            <input v-model.number="form.maxPoints" type="number" min="1" max="1000" style="width: 110px;">
          </label>
          <label class="check">
            <input v-model="form.allowResubmit" type="checkbox">
            Разрешить пересдачу
          </label>
        </div>
        <div class="md-editor-wrap" style="margin-top: 10px;">
          <MdEditor
            id="klassroom-assignment-editor"
            v-model="form.description"
            language="en-US"
            :toolbars="MD_TOOLBARS"
          />
        </div>
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
.sub-head {
  cursor: pointer;
  border-radius: 8px;
  padding: 2px 4px;
  margin: -2px -4px;
}
.sub-caret {
  align-self: center;
  color: var(--muted, #888);
  flex-shrink: 0;
}
.chat-btn { position: relative; }
.unread-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--danger, #d64545);
}
.sub-answer {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--card, #fff);
}
.sub-meta {
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}
.sub-body {
  margin: 8px 0 0;
  font-size: 14px;
}
.sub-body-sm {
  white-space: pre-wrap;
  margin: 6px 0 0;
  font-size: 13px;
}
.sub-history {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.sub-version {
  padding: 10px 12px;
  background: var(--bg-soft, #f6f6f6);
  border: 1px solid var(--line);
  border-left: 3px solid color-mix(in srgb, var(--accent) 55%, var(--line));
  border-radius: 8px;
}
/* комментарий учителя внутри версии — белая подложка, чтобы не сливался с фоном блока */
.sub-version .card-nested { background: var(--card, #fff); }
</style>
