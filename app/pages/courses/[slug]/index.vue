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
const rosterUsernames = computed(() => roster.value.map(s => s.username))
const canManage = computed(() => coursePageData.value?.canManage ?? false)

const crumbs = useBreadcrumbs()
watchEffect(() => {
  crumbs.value = course.value
    ? [{ label: 'Курсы', to: '/' }, { label: course.value.title }]
    : [{ label: 'Курсы', to: '/' }]
})

// --- вкладки ---
const tabs = [
  { id: 'info', label: 'Информация' },
  { id: 'topics', label: 'Темы' },
  { id: 'assignments', label: 'Задания' },
  { id: 'students', label: 'Учащиеся' },
] as const
type TabId = (typeof tabs)[number]['id']
const activeTab = ref<TabId>('info')
const initialTab = String(route.query.tab ?? '')
if (tabs.some(t => t.id === initialTab)) activeTab.value = initialTab as TabId

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

// --- участники курса ---
const rosterError = ref('')
const rosterBusy = ref(false)
const enrollOpen = ref(false)
const newStudentOpen = ref(false)
const revealedSecret = ref('')

async function removeStudent(username: string) {
  rosterError.value = ''
  rosterBusy.value = true
  try {
    await $fetch(`/api/courses/${course.value?.slug}/roster`, {
      method: 'POST',
      body: { username, action: 'remove' },
    })
    await refresh()
  } catch (e) {
    rosterError.value = errText(e, 'Не удалось изменить состав курса')
  } finally {
    rosterBusy.value = false
  }
}

// --- материалы (темы) ---
const materials = ref<Array<{ slug: string, title: string, type: string, updatedAt: string }>>([])
const materialsError = ref('')
const canMaterials = computed(() => coursePageData.value?.canMaterials ?? false)

async function loadMaterials() {
  materialsError.value = ''
  try {
    const res = await $fetch<{ materials: typeof materials.value }>(
      `/api/courses/${course.value?.slug}/topics`,
    )
    materials.value = res.materials
  } catch (e) {
    materialsError.value = errText(e, 'Не удалось загрузить материалы')
  }
}

// --- задания ---
interface AssignmentRow {
  slug: string
  title: string
  type: 'general' | 'private'
  status: 'draft' | 'published'
  due: string | null
  submissionCount: number
  myStatus?: 'none' | 'submitted' | 'returned'
  updatedAt: string
}
const assignments = ref<AssignmentRow[]>([])
const assignmentsError = ref('')
const canAssignments = computed(() => coursePageData.value?.canAssignments ?? false)

async function loadAssignments() {
  assignmentsError.value = ''
  try {
    const res = await $fetch<{ assignments: AssignmentRow[] }>(
      `/api/courses/${course.value?.slug}/assignments`,
    )
    assignments.value = res.assignments
  } catch (e) {
    assignmentsError.value = errText(e, 'Не удалось загрузить задания')
  }
}

watch(activeTab, (tab) => {
  if (tab === 'topics' && course.value) void loadMaterials()
  if (tab === 'assignments' && course.value) void loadAssignments()
}, { immediate: true })

function assignmentStatusLabel(a: AssignmentRow): string {
  if (!canAssignments.value) {
    if (a.myStatus === 'submitted' || a.myStatus === 'returned') return 'Есть ответ'
    return a.status === 'published' ? 'Выдано' : 'Не выдано'
  }
  return `${a.status === 'published' ? 'Выдано' : 'Не выдано'} · ответов: ${a.submissionCount}`
}

function openAssignment(a: AssignmentRow) {
  void navigateTo(`/courses/${course.value?.slug}/assignments/${a.slug}`)
}

async function deleteAssignment(a: AssignmentRow) {
  if (!window.confirm(`Удалить задание «${a.title}» вместе со сдачами?`)) return
  assignmentsError.value = ''
  try {
    await $fetch(`/api/courses/${course.value?.slug}/assignments/${a.slug}`, { method: 'DELETE' })
    await loadAssignments()
  } catch (e) {
    assignmentsError.value = errText(e, 'Не удалось удалить задание')
  }
}

type MaterialRow = { slug: string, title: string, type: string, updatedAt: string }

function materialUrl(m: MaterialRow): string {
  return `/courses/${course.value?.slug}/topics/${m.slug}`
}

function openMaterial(m: MaterialRow) {
  void navigateTo(materialUrl(m))
}

function editMaterial(m: MaterialRow) {
  void navigateTo(`${materialUrl(m)}?edit=1`)
}

async function deleteMaterial(m: MaterialRow) {
  if (!window.confirm(`Удалить материал «${m.title}» вместе с вложениями?`)) return
  materialsError.value = ''
  try {
    await $fetch(materialUrl(m), { method: 'DELETE' })
    await loadMaterials()
  } catch (e) {
    materialsError.value = errText(e, 'Не удалось удалить материал')
  }
}

const scaleLabel: Record<GradingScale['type'], string> = {
  grade5: 'Оценки 2–5',
  points: 'Баллы (до 100)',
  passfail: 'Зачёт / незачёт',
}
</script>

<template>
  <PageShell v-if="course" :show-foot="activeTab === 'info' && canManage">
    <template #title>{{ course.title }}</template>

    <nav class="tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        :class="{ active: activeTab === t.id }"
        @click="activeTab = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <!-- Информация -->
    <template v-if="activeTab === 'info'">
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
        <p v-if="course.description">{{ course.description }}</p>
        <p class="muted">Шкала оценивания: {{ scaleLabel[course.gradingScale.type] }} · Учеников: {{ roster.length }}</p>
      </div>
    </template>

    <!-- Темы -->
    <div v-else-if="activeTab === 'topics'" class="card">
      <SectionHead>
        Темы
        <template v-if="canMaterials" #actions>
          <span class="tip">
            <button
              class="icon-btn"
              aria-label="Добавить тему"
              @click="navigateTo(`/courses/${course.slug}/topics/new`)"
            >
              <Icon name="lucide:plus" />
            </button>
            <span class="tip-body">Добавить тему</span>
          </span>
        </template>
      </SectionHead>

      <p v-if="materialsError" class="error">{{ materialsError }}</p>
      <table v-if="materials.length" class="data-table">
        <thead>
          <tr>
            <th>Тема</th>
            <th>Тип</th>
            <th v-if="canMaterials" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in materials"
            :key="m.slug"
            class="is-clickable"
            tabindex="0"
            @click="openMaterial(m)"
            @keydown.enter="openMaterial(m)"
          >
            <td><strong>{{ m.title }}</strong></td>
            <td class="muted">{{ m.type === 'doc' ? 'конспект' : m.type }}</td>
            <td v-if="canMaterials" class="row-actions">
              <span class="tip">
                <button
                  class="icon-btn"
                  aria-label="Редактировать тему"
                  @click.stop="editMaterial(m)"
                >
                  <Icon name="lucide:pencil" />
                </button>
                <span class="tip-body">Редактировать</span>
              </span>
              <span class="tip">
                <button
                  class="icon-btn danger"
                  aria-label="Удалить тему"
                  @click.stop="deleteMaterial(m)"
                >
                  <Icon name="lucide:trash-2" />
                </button>
                <span class="tip-body">Удалить</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Тем пока нет.</p>
    </div>

    <!-- Задания -->
    <div v-else-if="activeTab === 'assignments'" class="card">
      <SectionHead>
        Домашние задания
        <template v-if="canAssignments" #actions>
          <span class="tip">
            <button
              class="icon-btn"
              aria-label="Добавить задание"
              @click="navigateTo(`/courses/${course.slug}/assignments/new`)"
            >
              <Icon name="lucide:plus" />
            </button>
            <span class="tip-body">Добавить задание</span>
          </span>
        </template>
      </SectionHead>

      <p v-if="assignmentsError" class="error">{{ assignmentsError }}</p>
      <table v-if="assignments.length" class="data-table">
        <thead>
          <tr>
            <th>Задание</th>
            <th>Тип</th>
            <th>Дедлайн</th>
            <th>Статус</th>
            <th v-if="canAssignments" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="a in assignments"
            :key="a.slug"
            class="is-clickable"
            tabindex="0"
            @click="openAssignment(a)"
            @keydown.enter="openAssignment(a)"
          >
            <td><strong>{{ a.title }}</strong></td>
            <td class="muted">{{ a.type === 'private' ? 'частное' : 'общее' }}</td>
            <td class="muted">{{ a.due ?? '—' }}</td>
            <td>{{ assignmentStatusLabel(a) }}</td>
            <td v-if="canAssignments" class="row-actions">
              <span class="tip">
                <button
                  class="icon-btn"
                  aria-label="Редактировать задание"
                  @click.stop="navigateTo(`/courses/${course.slug}/assignments/${a.slug}?edit=1`)"
                >
                  <Icon name="lucide:pencil" />
                </button>
                <span class="tip-body">Редактировать</span>
              </span>
              <span class="tip">
                <button
                  class="icon-btn danger"
                  aria-label="Удалить задание"
                  @click.stop="deleteAssignment(a)"
                >
                  <Icon name="lucide:trash-2" />
                </button>
                <span class="tip-body">Удалить</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Заданий пока нет.</p>
    </div>

    <!-- Учащиеся -->
    <div v-else class="card">
      <SectionHead>
        Учащиеся ({{ roster.length }})
        <template v-if="canManage" #actions>
          <AppDropdown>
            <template #trigger>
              <span class="tip">
                <button class="icon-btn" aria-label="Действия с учащимися">
                  <Icon name="lucide:plus" />
                </button>
                <span class="tip-body">Учащиеся</span>
              </span>
            </template>
            <template #menu="{ close }">
              <button @click="enrollOpen = true; close()">Записать учащегося на курс</button>
              <button @click="newStudentOpen = true; close()">Добавить нового учащегося</button>
            </template>
          </AppDropdown>
        </template>
      </SectionHead>

      <p v-if="revealedSecret" class="muted" style="margin-bottom: 6px;">
        Пароль нового ученика (виден один раз):
      </p>
      <div v-if="revealedSecret" class="secret" style="margin-bottom: 10px;">{{ revealedSecret }}</div>
      <button v-if="revealedSecret" class="small" style="margin-bottom: 12px;" @click="revealedSecret = ''">Скрыть</button>

      <p v-if="rosterError" class="error" style="margin-bottom: 12px;">{{ rosterError }}</p>
      <table v-if="roster.length" class="data-table">
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
            <td v-if="canManage" class="row-actions">
              <span class="tip">
                <button
                  class="icon-btn danger"
                  aria-label="Исключить из курса"
                  :disabled="rosterBusy"
                  @click="removeStudent(s.username)"
                >
                  <Icon name="lucide:trash-2" />
                </button>
                <span class="tip-body">Исключить</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Учеников пока нет.</p>
    </div>

    <EnrollModal
      v-if="enrollOpen && course"
      :slug="course.slug"
      :enrolled="rosterUsernames"
      @close="enrollOpen = false"
      @changed="enrollOpen = false; refresh()"
    />
    <NewStudentPanel
      v-if="newStudentOpen && course"
      :slug="course.slug"
      @close="newStudentOpen = false"
      @created="(pw) => { revealedSecret = pw ?? ''; newStudentOpen = false; refresh() }"
    />

    <template #foot>
      <button class="primary" form="course-settings" :disabled="saving">
        {{ saving ? 'Сохранение…' : 'Сохранить' }}
      </button>
    </template>
  </PageShell>
</template>
