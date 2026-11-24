<script setup lang="ts">
import type { CourseGroup } from '#shared/types'
import { useCourseContext } from '~/composables/useCourseContext'

/**
 * Раздел «Группы»: под-вкладки по группам курса + <NuxtPage/>.
 * Список групп — собственные данные раздела (один запрос на вкладку).
 */
const route = useRoute()
const { data: coursePageData } = useCourseContext()
const slug = computed(() => coursePageData.value?.course?.slug ?? '')
const canManage = computed(() => Boolean(coursePageData.value?.canManage))

const groups = ref<CourseGroup[]>([])
async function load() {
  if (!slug.value) return
  try {
    groups.value = await $fetch<CourseGroup[]>(`/api/courses/${slug.value}/groups`)
  } catch {
    groups.value = []
  }
}
watch(slug, () => { void load() }, { immediate: true })

const base = computed(() => `/courses/${slug.value}/groups`)
const tabs = computed(() => [
  { id: 'overview', label: 'Обзор', to: base.value },
  ...groups.value.map(g => ({ id: g.id, label: g.title, to: `${base.value}/${g.id}` })),
])
const activeTab = computed(() => {
  const gid = route.params.gid
  if (typeof gid === 'string' && gid) return gid
  return 'overview'
})
</script>

<template>
  <div class="course-page">
    <div class="course-content">
      <nav v-if="canManage || groups.length" class="tabs" style="margin-bottom: 14px;">
        <NuxtLink
          v-for="t in tabs"
          :key="t.id"
          :to="t.to"
          :class="{ active: activeTab === t.id }"
        >
          {{ t.label }}
        </NuxtLink>
      </nav>
      <NuxtPage />
    </div>
  </div>
</template>
