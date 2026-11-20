<script setup lang="ts">
/**
 * Лейаут раздела курса: заголовок + вкладки (часть пути) + <NuxtPage/>.
 * Вкладки: /courses/<slug> — Информация, /topics, /assignments, /students.
 * Дочерние страницы рендерят только контент своей вкладки/сущности
 * (маркup: .course-content + опциональный .page-foot соседним узлом).
 */
import { courseContextKey } from '~/composables/useCourseContext'
import { errText } from '#shared/errors'
import type { CoursePageData } from '#shared/types'

const route = useRoute()
const router = useRouter()
const slug = computed(() => String(route.params.slug))

const { data: coursePageData, refresh, error: loadError } = await useFetch<CoursePageData>(
  `/api/courses/${slug.value}`,
  { key: `course-${slug.value}` },
)
if (loadError.value) {
  throw createError({ statusCode: 404, statusMessage: 'Курс не найден', fatal: true })
}

provide(courseContextKey, {
  data: coursePageData,
  refresh: () => refresh().then(() => {}),
})

const courseData = computed(() => coursePageData.value)
const canViewRoster = computed(() => Boolean(courseData.value?.canViewRoster))
const canManage = computed(() => Boolean(courseData.value?.canManage))

// --- удаление курса: иконка в заголовке, подтверждение вводом названия ---
const showDelete = ref(false)
const deleteInput = ref('')
const deleting = ref(false)
const deleteError = ref('')
const deleteReady = computed(() =>
  courseData.value?.course && deleteInput.value.trim() === courseData.value.course.title,
)

async function confirmDelete() {
  const c = courseData.value?.course
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

interface TabDef { id: string, label: string, to: string }
const tabs = computed<TabDef[]>(() => {
  const base = `/courses/${slug.value}`
  return [
    { id: 'info', label: 'Информация', to: base },
    { id: 'topics', label: 'Темы', to: `${base}/topics` },
    { id: 'assignments', label: 'Задания', to: `${base}/assignments` },
    ...(canViewRoster.value ? [{ id: 'students', label: 'Учащиеся', to: `${base}/students` }] : []),
  ]
})

const activeTab = computed(() => {
  const path = route.path
  const sorted = [...tabs.value].sort((a, b) => b.to.length - a.to.length)
  return sorted.find(t => path === t.to || path.startsWith(`${t.to}/`))?.id ?? 'info'
})

// «Учащиеся» недоступна без courses.roster.view — редирект на «Информацию»
const studentsTo = computed(() => `/courses/${slug.value}/students`)
watchEffect(() => {
  if (route.path === studentsTo.value && !canViewRoster.value) {
    void router.replace(`/courses/${slug.value}`)
  }
})

const fullWidth = usePageFullWidth()

// оглавление тем — на всех страницах раздела /topics (список, просмотр, new)
const showToc = computed(() => route.path.startsWith(`/courses/${slug.value}/topics`))
const topicSlug = computed(() => (route.params.topic ? String(route.params.topic) : undefined))
</script>

<template>
  <div class="page" :class="{ 'is-full': fullWidth, 'toc-split': showToc }">
    <TopicsToc v-if="showToc" :course-slug="slug" :active-slug="topicSlug" />
    <div class="page-col">
    <header class="page-head">
      <h1 class="page-title">{{ courseData?.course?.title ?? '…' }}</h1>
      <div class="page-actions">
        <span v-if="canManage" class="tip">
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
    </header>

    <nav class="tabs">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.id"
        :to="tab.to"
        :class="{ active: activeTab === tab.id }"
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>

    <div class="course-body">
      <NuxtPage />
    </div>

    <div v-if="showDelete" class="modal-backdrop" @click.self="showDelete = false">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Удаление курса">
        <div class="modal-head">
          <h2>Удалить курс?</h2>
          <button class="icon-btn" aria-label="Закрыть" @click="showDelete = false">
            <Icon name="lucide:x" />
          </button>
        </div>
        <p>
          Курс <strong>«{{ courseData?.course?.title }}»</strong> и все его материалы,
          задания и сдачи будут удалены безвозвратно.
        </p>
        <label>
          Для подтверждения введите название курса
          <input v-model="deleteInput" :placeholder="courseData?.course?.title" autocomplete="off">
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
  </div>
</template>

<style scoped>
.danger-btn {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.danger-btn:hover:not(:disabled) { filter: brightness(1.08); }
.modal label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); margin-top: 10px; }
</style>
