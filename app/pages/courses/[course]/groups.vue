<script setup lang="ts">
import { useCourseContext } from '~/composables/useCourseContext'

/**
 * Раздел «Группы»: оглавление групп слева (как у тем) + <NuxtPage/>.
 */
const route = useRoute()
const { data: coursePageData } = useCourseContext()
const slug = computed(() => coursePageData.value?.course?.slug ?? '')
const activeGid = computed(() => {
  const gid = route.params.id
  return typeof gid === 'string' && gid ? gid : undefined
})
</script>

<template>
  <div class="course-page">
    <GroupsToc
      v-if="slug && activeGid"
      :course-slug="slug"
      :active-gid="activeGid"
    />
    <div class="course-content">
      <NuxtPage />
    </div>
  </div>
</template>
