<script setup lang="ts">
/**
 * Лейаут раздела курса: заголовок + вкладки (часть пути) + <NuxtPage/>.
 * Вкладки: /courses/<slug> — Информация, /topics, /assignments, /students.
 * Дочерние страницы рендерят только контент своей вкладки/сущности
 * (маркup: .course-content + опциональный .page-foot соседним узлом).
 */
import { courseContextKey } from '~/composables/useCourseContext'
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

interface TabDef { id: string, label: string, to: string }
const tabs = computed<TabDef[]>(() => {
  const base = `/courses/${slug.value}`
  return [
    { id: 'info', label: 'Информация', to: base },
    { id: 'topics', label: 'Темы', to: `${base}/topics` },
    { id: 'assignments', label: 'Задания', to: `${base}/assignments` },
    { id: 'stream', label: 'Лента', to: `${base}/stream` },
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

// оглавление тем — только на странице просмотра темы (/topics/<slug>,
// не на списке /topics и не на /topics/new)
const showToc = computed(() => {
  const t = route.params.topic
  return typeof t === 'string' && t.length > 0 && t !== 'new'
})
const topicSlug = computed(() => (route.params.topic ? String(route.params.topic) : undefined))
</script>

<template>
  <div class="page" :class="{ 'is-full': fullWidth }">
    <header class="page-head">
      <h1 class="page-title">{{ courseData?.course?.title ?? '…' }}</h1>
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

    <TopicsToc v-if="showToc" :course-slug="slug" :active-slug="topicSlug" />

    <div class="course-body">
      <NuxtPage />
    </div>
  </div>
</template>
