<script setup lang="ts">
import type { GradingScale } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'

const route = useRoute()
const { data: coursePageData, refresh } = useCourseContext()
const course = computed(() => coursePageData.value?.course ?? null)
const canManage = computed(() => coursePageData.value?.canManage ?? false)
const slug = computed(() => course.value?.slug ?? '')

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const c = course.value
  crumbs.value = c
    ? [{ label: 'Курсы', to: '/' }, { label: c.title }]
    : [{ label: 'Курсы', to: '/' }]
})

// --- режимы: просмотр по умолчанию, «Редактировать» → форма ---
const editing = ref(false)

const form = reactive({
  title: '',
  description: '',
  scaleType: 'grade5' as GradingScale['type'],
})

// --- обложка: грузится/удаляется сразу (как вложения материалов) ---
const coverName = ref('')
const coverV = ref(0)
const coverBusy = ref(false)
const coverError = ref('')
const coverUrl = computed(() =>
  coverName.value ? `/api/courses/${slug.value}/cover?v=${coverV.value}` : '',
)
watchEffect(() => {
  coverName.value = course.value?.cover ?? ''
})

async function uploadCover(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !slug.value) return
  coverBusy.value = true
  coverError.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    const r = await $fetch<{ cover: string }>(`/api/courses/${slug.value}/cover`, {
      method: 'POST',
      body: fd,
    })
    coverName.value = r.cover
    coverV.value = Date.now()
    await refresh()
  } catch (err) {
    coverError.value = errText(err, 'Не удалось загрузить обложку')
  } finally {
    coverBusy.value = false
  }
}

async function removeCover() {
  if (!slug.value) return
  coverBusy.value = true
  coverError.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/cover`, { method: 'DELETE' })
    coverName.value = ''
    coverV.value = Date.now()
    await refresh()
  } catch (err) {
    coverError.value = errText(err, 'Не удалось удалить обложку')
  } finally {
    coverBusy.value = false
  }
}

// --- защита от ухода без сохранения (как у темы) ---
const savedSnapshot = ref('')
function settingsSnapshot() {
  return JSON.stringify({ t: form.title, d: form.description, s: form.scaleType })
}
const dirty = computed(() => editing.value && settingsSnapshot() !== savedSnapshot.value)

const leaveConfirmOpen = ref(false)
let leaveResolve: ((v: boolean) => void) | null = null
const leaveGuard = () => {
  if (!dirty.value) return true
  return new Promise<boolean>((resolve) => {
    leaveResolve = resolve
    leaveConfirmOpen.value = true
  })
}
onBeforeRouteLeave(leaveGuard)
onBeforeRouteUpdate(leaveGuard)
function answerLeave(stay: boolean) {
  leaveConfirmOpen.value = false
  leaveResolve?.(stay)
  leaveResolve = null
}
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// --- редактирование ---
function startEdit() {
  const c = course.value
  if (!c) return
  form.title = c.title
  form.description = c.description
  form.scaleType = c.gradingScale.type
  editing.value = true
  savedSnapshot.value = settingsSnapshot()
}

const cancelConfirmOpen = ref(false)
function cancelEdit() {
  if (!dirty.value) {
    editing.value = false
    return
  }
  cancelConfirmOpen.value = true
}
function confirmCancelEdit() {
  cancelConfirmOpen.value = false
  editing.value = false
}

// «Редактировать» извне может прийти с ?edit=1
if (route.query.edit === '1' && canManage.value) startEdit()

const saveError = ref('')
const saving = ref(false)

async function saveSettings() {
  if (!course.value) return
  saveError.value = ''
  saving.value = true
  try {
    const gradingScale: GradingScale =
      form.scaleType === 'points' ? { type: 'points', max: 100 } : { type: form.scaleType }
    await $fetch(`/api/courses/${course.value.slug}`, {
      method: 'PATCH',
      body: { title: form.title, description: form.description, gradingScale },
    })
    editing.value = false
    savedSnapshot.value = ''
    await refresh()
  } catch (e) {
    saveError.value = errText(e, 'Не удалось сохранить настройки')
  } finally {
    saving.value = false
  }
}

// --- удаление курса (переехало из шапки раздела на эту вкладку) ---
const showDelete = ref(false)
const deleteInput = ref('')
const deleting = ref(false)
const deleteError = ref('')
const deleteReady = computed(() =>
  course.value && deleteInput.value.trim() === course.value.title,
)

async function confirmDelete() {
  const c = course.value
  if (!c || !deleteReady.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch(`/api/courses/${c.slug}`, { method: 'DELETE' })
    await navigateTo('/')
  } catch (e) {
    deleteError.value = errText(e, 'Не удалось удалить курс')
    deleting.value = false
  }
}

const scaleLabel: Record<GradingScale['type'], string> = {
  grade5: 'Оценки 2–5',
  points: 'Баллы (до 100)',
  passfail: 'Зачёт / незачёт',
}
</script>

<template>
  <div class="course-page">
  <div class="course-content">
    <!-- Просмотр -->
    <div v-if="!editing" class="course-info">
      <div class="course-info-body">
        <div class="course-info-head">
          <SectionHead>О курсе</SectionHead>
          <div v-if="canManage" class="page-actions">
            <span class="tip">
              <button class="icon-btn" aria-label="Редактировать курс" @click="startEdit">
                <Icon name="lucide:pencil" />
              </button>
              <span class="tip-body">Редактировать</span>
            </span>
            <span class="tip">
              <button
                class="icon-btn danger"
                aria-label="Удалить курс"
                @click="showDelete = true; deleteInput = ''; deleteError = ''"
              >
                <Icon name="lucide:trash-2" />
              </button>
              <span class="tip-body">Удалить курс</span>
            </span>
          </div>
        </div>
        <p v-if="course?.description" class="course-desc">{{ course.description }}</p>
        <p v-else class="muted">Описание не задано.</p>
        <p class="muted course-meta">
          Шкала оценивания: {{ scaleLabel[course?.gradingScale.type ?? 'grade5'] }}
          · Учеников: {{ course?.students.length ?? 0 }}
        </p>
      </div>
      <img v-if="coverUrl" class="course-cover" :src="coverUrl" alt="Обложка курса">
    </div>

    <!-- Редактирование -->
    <div v-else class="card">
      <SectionHead>Настройки курса</SectionHead>
      <form id="course-settings" class="form" @submit.prevent="saveSettings">
        <div class="cover-field">
          <span class="cover-label">Обложка курса</span>
          <div v-if="coverUrl" class="cover-preview">
            <img :src="coverUrl" alt="Обложка курса">
          </div>
          <div class="cover-actions">
            <label class="cover-upload">
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
                hidden
                :disabled="coverBusy"
                @change="uploadCover"
              >
              <span class="cover-upload-btn">{{ coverUrl ? 'Заменить' : 'Выбрать файл' }}</span>
            </label>
            <button v-if="coverUrl" type="button" :disabled="coverBusy" @click="removeCover">
              Удалить обложку
            </button>
          </div>
          <p class="muted cover-hint">png, jpg, gif, webp, avif, bmp — до 5 МБ.</p>
          <p v-if="coverError" class="error">{{ coverError }}</p>
        </div>
        <label>
          Название
          <input v-model="form.title" required>
        </label>
        <label>
          Описание
          <textarea v-model="form.description" rows="3" />
        </label>
        <label>
          Шкала оценивания
          <select v-model="form.scaleType">
            <option value="grade5">Оценки 2–5</option>
            <option value="points">Баллы (до 100)</option>
            <option value="passfail">Зачёт / незачёт</option>
          </select>
        </label>
        <p v-if="saveError" class="error">{{ saveError }}</p>
      </form>
    </div>
  </div>

  <footer v-if="editing" class="page-foot">
    <button class="primary" form="course-settings" :disabled="saving || !form.title">
      {{ saving ? 'Сохранение…' : 'Сохранить' }}
    </button>
    <button @click="cancelEdit">Отмена</button>
  </footer>

  <!-- удаление курса: подтверждение вводом названия -->
  <div v-if="showDelete" class="modal-backdrop" @click.self="showDelete = false">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Удаление курса">
      <div class="modal-head">
        <h2>Удалить курс?</h2>
        <button class="icon-btn" aria-label="Закрыть" @click="showDelete = false">
          <Icon name="lucide:x" />
        </button>
      </div>
      <p>
        Курс <strong>«{{ course?.title }}»</strong> и все его материалы,
        задания и сдачи будут удалены безвозвратно.
      </p>
      <label>
        Для подтверждения введите название курса
        <input v-model="deleteInput" :placeholder="course?.title" autocomplete="off">
      </label>
      <p v-if="deleteError" class="error">{{ deleteError }}</p>
      <div class="modal-foot">
        <button @click="showDelete = false">Отмена</button>
        <button class="danger-btn" :disabled="!deleteReady || deleting" @click="confirmDelete">
          {{ deleting ? 'Удаление…' : 'Удалить курс' }}
        </button>
      </div>
    </div>
  </div>

  <ConfirmModal
    v-if="leaveConfirmOpen"
    title="Несохранённые изменения"
    message="Настройки курса не сохранены. Уйти без сохранения?"
    confirm-label="Уйти без сохранения"
    danger
    @confirm="answerLeave(true)"
    @cancel="answerLeave(false)"
  />
  <ConfirmModal
    v-if="cancelConfirmOpen"
    title="Несохранённые изменения"
    message="Изменения не сохранены. Выйти из редактирования без сохранения?"
    confirm-label="Выйти без сохранения"
    danger
    @confirm="confirmCancelEdit"
    @cancel="cancelConfirmOpen = false"
  />
  </div>
</template>

<style scoped>
/* просмотр без карточки — как страница темы: обложка баннером, текст на фоне страницы */
.course-cover {
  display: block;
  width: 100%;
  max-height: 260px;
  object-fit: cover;
  border-radius: 12px;
  margin-top: 16px;
}
.course-info-body { min-width: 0; }
.course-info-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.course-info-head .page-actions { display: inline-flex; gap: 6px; }
.course-desc { margin: 6px 0 10px; white-space: pre-wrap; }
.course-meta { margin: 0; font-size: 13px; }

.cover-field { display: grid; gap: 8px; margin-bottom: 14px; }
.cover-label { font-size: 13px; font-weight: 600; }
/* превью обложки — те же пропорции, что у баннера на просмотре */
.cover-preview img {
  display: block;
  width: 100%;
  max-height: 260px;
  object-fit: cover;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.cover-actions { display: flex; align-items: center; gap: 10px; }
.cover-upload-btn {
  display: inline-block;
  padding: 7px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-soft);
  font-size: 13px;
  cursor: pointer;
}
.cover-upload-btn:hover { border-color: var(--accent); color: var(--accent); }
.cover-hint { margin: 0; font-size: 12px; }

.danger-btn {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.danger-btn:hover:not(:disabled) { filter: brightness(1.08); }
.modal label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); margin-top: 10px; }
</style>
