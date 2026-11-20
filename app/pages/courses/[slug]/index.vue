<script setup lang="ts">
import type { GradingScale } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'

const { data: coursePageData, refresh } = useCourseContext()
const course = computed(() => coursePageData.value?.course ?? null)
const canManage = computed(() => coursePageData.value?.canManage ?? false)

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const c = course.value
  crumbs.value = c
    ? [{ label: 'Курсы', to: '/' }, { label: c.title }]
    : [{ label: 'Курсы', to: '/' }]
})

// --- настройки курса ---
const form = reactive({
  title: '',
  description: '',
  scaleType: 'grade5' as GradingScale['type'],
})
watchEffect(() => {
  if (course.value) {
    form.title = course.value.title
    form.description = course.value.description
    form.scaleType = course.value.gradingScale.type
  }
})

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
    await refresh()
  } catch (e) {
    saveError.value = errText(e, 'Не удалось сохранить настройки')
  } finally {
    saving.value = false
  }
}

const scaleLabel: Record<GradingScale['type'], string> = {
  grade5: 'Оценки 2–5',
  points: 'Баллы (до 100)',
  passfail: 'Зачёт / незачёт',
}

// --- удаление курса (как в GitLab: подтверждение вводом названия) ---
const showDelete = ref(false)
const deleteInput = ref('')
const deleting = ref(false)
const deleteError = ref('')

const deleteReady = computed(() => course.value && deleteInput.value.trim() === course.value.title)

async function confirmDelete() {
  if (!course.value || !deleteReady.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch(`/api/courses/${course.value.slug}`, { method: 'DELETE' })
    await navigateTo('/')
  } catch (e) {
    deleteError.value = errText(e, 'Не удалось удалить курс')
    deleting.value = false
  }
}
</script>

<template>
  <div class="course-page">
  <div class="course-content">
    <div v-if="canManage" class="card">
      <SectionHead>Настройки курса</SectionHead>
      <form id="course-settings" class="form" @submit.prevent="saveSettings">
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
      <div class="danger-zone">
        <button class="danger-btn" type="button" @click="showDelete = true; deleteInput = ''; deleteError = ''">
          Удалить курс
        </button>
      </div>
    </div>
    <div v-else class="card">
      <SectionHead>О курсе</SectionHead>
      <p v-if="course?.description">{{ course.description }}</p>
      <p class="muted">Шкала оценивания: {{ scaleLabel[course?.gradingScale.type ?? 'grade5'] }} · Учеников: {{ course?.students.length ?? 0 }}</p>
    </div>
  </div>

  <footer v-if="canManage" class="page-foot">
    <button class="primary" form="course-settings" :disabled="saving">
      {{ saving ? 'Сохранение…' : 'Сохранить' }}
    </button>
  </footer>

  <div v-if="showDelete" class="modal-backdrop" @click.self="showDelete = false">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Удаление курса">
      <div class="modal-head">
        <h2>Удалить курс?</h2>
        <button class="icon-btn" aria-label="Закрыть" @click="showDelete = false">
          <Icon name="lucide:x" />
        </button>
      </div>
      <p>
        Курс <strong>«{{ course?.title }}»</strong> и все его материалы, задания
        и сдачи будут удалены безвозвратно.
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
  </div>
</template>

<style scoped>
.danger-zone { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.danger-btn {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.danger-btn:hover:not(:disabled) { filter: brightness(1.08); }
.modal label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); margin-top: 10px; }
</style>
