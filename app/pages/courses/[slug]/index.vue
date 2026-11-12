<script setup lang="ts">
import type { GradingScale } from '#shared/types'
import { errText } from '#shared/errors'

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data: coursePageData, refresh, error: loadError } = await useFetch(`/api/courses/${slug.value}`)
if (loadError.value) {
  throw createError({ statusCode: 404, message: 'Курс не найден', fatal: true })
}

const course = computed(() => coursePageData.value?.course ?? null)
const roster = computed(() => coursePageData.value?.roster ?? [])
const canManage = computed(() => coursePageData.value?.canManage ?? false)

const crumbs = useBreadcrumbs()
watchEffect(() => {
  crumbs.value = course.value
    ? [{ label: 'Курсы', to: '/' }, { label: course.value.title }]
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

// --- создание нового ученика с авто-зачислением ---
const newAcc = reactive({ username: '', pseudonym: '' })
const accError = ref('')
const accBusy = ref(false)
const revealedSecret = ref('')

async function createStudentAndEnroll() {
  accError.value = ''
  accBusy.value = true
  try {
    const created = await $fetch<{ generatedPassword?: string }>('/api/users', {
      method: 'POST',
      body: { username: newAcc.username, pseudonym: newAcc.pseudonym, role: 'student' },
    })
    await changeRoster(newAcc.username.trim().toLowerCase(), 'add')
    if (created.generatedPassword) revealedSecret.value = created.generatedPassword
    newAcc.username = ''
    newAcc.pseudonym = ''
  } catch (e) {
    accError.value = errText(e, 'Не удалось создать ученика')
  } finally {
    accBusy.value = false
  }
}

// --- материалы ---
const materials = ref<Array<{ slug: string, title: string, type: string, updatedAt: string }>>([])
const materialsError = ref('')
const canMaterials = computed(() => coursePageData.value?.canMaterials ?? false)
const matTypes = ref<Array<{ type: string, title: string }>>([{ type: 'doc', title: 'Конспект (markdown)' }])
const newMat = reactive({ title: '', type: 'doc' })
const newMatError = ref('')
const newMatBusy = ref(false)

async function loadMaterials() {
  materialsError.value = ''
  try {
    const res = await $fetch<{ materials: typeof materials.value }>(
      `/api/courses/${course.value?.slug}/materials`,
    )
    materials.value = res.materials
  } catch (e) {
    materialsError.value = errText(e, 'Не удалось загрузить материалы')
  }
}

async function loadMaterialTypes() {
  try {
    const res = await $fetch<{ types: Array<{ type: string, title: string }> }>('/api/material-types')
    matTypes.value = res.types
  } catch {
    // при ошибке оставляем единственный известный тип
  }
}

watchEffect(() => {
  if (course.value && canMaterials.value) {
    void loadMaterials()
    void loadMaterialTypes()
  } else if (course.value) {
    void loadMaterials()
  }
})

async function createMaterial() {
  newMatError.value = ''
  newMatBusy.value = true
  try {
    const created = await $fetch<{ material: { slug: string } }>(
      `/api/courses/${course.value?.slug}/materials`,
      { method: 'POST', body: { title: newMat.title, type: newMat.type, content: '' } },
    )
    newMat.title = ''
    await navigateTo(`/courses/${course.value?.slug}/materials/${created.material.slug}`)
  } catch (e) {
    newMatError.value = errText(e, 'Не удалось создать материал')
  } finally {
    newMatBusy.value = false
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
        <input v-model="newStudent" placeholder="Логин существующего ученика" style="flex: 1;">
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

      <div v-if="canManage" style="margin-top: 18px; border-top: 1px solid var(--line); padding-top: 14px;">
        <h2>Новый ученик</h2>
        <p class="muted">Аккаунт будет создан и сразу зачислен на курс; пароль покажем один раз — передайте его лично.</p>
        <div class="row" style="gap: 12px; flex-wrap: wrap;">
          <label style="flex: 1; min-width: 140px;">
            Логин
            <input v-model="newAcc.username" autocomplete="off" placeholder="например ezhik-7">
          </label>
          <label style="flex: 2; min-width: 160px;">
            Псевдоним
            <input v-model="newAcc.pseudonym" placeholder="например Ёжик-7">
          </label>
        </div>
        <p v-if="accError" class="error" style="margin-top: 10px;">{{ accError }}</p>
        <button
          class="primary"
          style="margin-top: 10px;"
          :disabled="accBusy || !newAcc.username || !newAcc.pseudonym"
          @click="createStudentAndEnroll"
        >
          Создать и зачислить
        </button>
      </div>

      <div v-if="revealedSecret" style="margin-top: 14px;">
        <p class="muted" style="margin-bottom: 6px;">Пароль нового ученика (виден один раз):</p>
        <div class="secret">{{ revealedSecret }}</div>
        <button class="small" style="margin-top: 8px;" @click="revealedSecret = ''">Скрыть</button>
      </div>
    </div>

    <div class="card">
      <h2>Материалы</h2>

      <div v-if="canMaterials" class="row" style="gap: 12px; flex-wrap: wrap; margin-bottom: 14px;">
        <input v-model="newMat.title" placeholder="Название нового материала" style="flex: 2; min-width: 200px;">
        <select v-model="newMat.type" style="flex: 1; min-width: 160px;">
          <option v-for="t in matTypes" :key="t.type" :value="t.type">{{ t.title }}</option>
        </select>
        <button class="primary" :disabled="newMatBusy || !newMat.title" @click="createMaterial">
          Создать
        </button>
      </div>
      <p v-if="newMatError" class="error" style="margin-bottom: 10px;">{{ newMatError }}</p>

      <p v-if="materialsError" class="error">{{ materialsError }}</p>
      <table v-if="materials.length">
        <tbody>
          <tr v-for="m in materials" :key="m.slug">
            <td>
              <NuxtLink :to="`/courses/${course.slug}/materials/${m.slug}`">{{ m.title }}</NuxtLink>
            </td>
            <td class="muted">{{ m.type === 'doc' ? 'конспект' : m.type }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Материалов пока нет.</p>
    </div>

    <div class="card">
      <h2>Домашние задания</h2>
      <p class="muted">
        Задания появятся на следующем шаге — здесь будет список с дедлайнами и статусами сдачи.
      </p>
    </div>
  </div>
</template>
