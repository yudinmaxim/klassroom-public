<script setup lang="ts">
import type { GradingScale } from '#shared/types'
import { errText } from '#shared/errors'

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data, refresh, error: loadError } = await useFetch(`/api/courses/${slug.value}`)
if (loadError.value) {
  throw createError({ statusCode: 404, message: 'Курс не найден', fatal: true })
}

const course = computed(() => data.value?.course ?? null)
const roster = computed(() => data.value?.roster ?? [])
const canManage = computed(() => data.value?.canManage ?? false)

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

// --- состав курса ---
const newStudent = ref('')
const rosterError = ref('')
const rosterBusy = ref(false)

async function changeRoster(username: string, action: 'add' | 'remove') {
  rosterError.value = ''
  rosterBusy.value = true
  try {
    await $fetch(`/api/courses/${course.value?.slug}/roster`, {
      method: 'POST',
      body: { username, action },
    })
    newStudent.value = ''
    await refresh()
  } catch (e) {
    rosterError.value = errText(e, 'Не удалось изменить состав курса')
  } finally {
    rosterBusy.value = false
  }
}

const scaleLabel: Record<GradingScale['type'], string> = {
  grade5: 'Оценки 2–5',
  points: 'Баллы (до 100)',
  passfail: 'Зачёт / незачёт',
}
</script>

<template>
  <div v-if="course">
    <p><NuxtLink to="/">← Все курсы</NuxtLink></p>
    <h1>{{ course.title }}</h1>
    <p v-if="course.description" class="muted">{{ course.description }}</p>
    <p class="muted">Шкала оценивания: {{ scaleLabel[course.gradingScale.type] }} · Учеников: {{ roster.length }}</p>

    <div v-if="canManage" class="card">
      <h2>Настройки курса</h2>
      <form class="form" @submit.prevent="saveSettings">
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
        <button class="primary" :disabled="saving">Сохранить</button>
      </form>
    </div>

    <div class="card">
      <h2>Ученики</h2>
      <div v-if="canManage" class="row" style="margin-bottom: 12px;">
        <input v-model="newStudent" placeholder="Логин ученика, например ezhik-7" style="flex: 1;">
        <button class="primary" :disabled="rosterBusy || !newStudent" @click="changeRoster(newStudent.trim(), 'add')">
          Зачислить
        </button>
      </div>
      <p v-if="rosterError" class="error" style="margin-bottom: 12px;">{{ rosterError }}</p>
      <table v-if="roster.length">
        <thead>
          <tr>
            <th>Псевдоним</th>
            <th>Логин</th>
            <th v-if="canManage" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in roster" :key="s.username">
            <td>{{ s.pseudonym }}</td>
            <td class="muted">{{ s.username }}</td>
            <td v-if="canManage">
              <button class="small" :disabled="rosterBusy" @click="changeRoster(s.username, 'remove')">
                Исключить
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Учеников пока нет.</p>
    </div>

    <div class="card">
      <h2>Материалы и задания</h2>
      <p class="muted">
        Материалы (конспекты) и домашние задания появятся на следующих шагах —
        здесь они будут видны списком.
      </p>
    </div>
  </div>
</template>
