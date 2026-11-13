<script setup lang="ts">
import type { GradingScale } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'

const { data: coursePageData, refresh } = useCourseContext()
const course = computed(() => coursePageData.value?.course ?? null)
const roster = computed(() => coursePageData.value?.roster ?? [])
const canManage = computed(() => coursePageData.value?.canManage ?? false)

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const c = course.value
  crumbs.value = c
    ? [{ label: 'Курсы', to: '/courses' }, { label: c.title }]
    : [{ label: 'Курсы', to: '/courses' }]
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
    </div>
    <div v-else class="card">
      <SectionHead>О курсе</SectionHead>
      <p v-if="course?.description">{{ course.description }}</p>
      <p class="muted">Шкала оценивания: {{ scaleLabel[course?.gradingScale.type ?? 'grade5'] }} · Учеников: {{ roster.length }}</p>
    </div>
  </div>

  <footer v-if="canManage" class="page-foot">
    <button class="primary" form="course-settings" :disabled="saving">
      {{ saving ? 'Сохранение…' : 'Сохранить' }}
    </button>
  </footer>
  </div>
</template>
