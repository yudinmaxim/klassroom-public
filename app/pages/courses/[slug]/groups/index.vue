<script setup lang="ts">
import type { CourseGroup } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'

const { data: coursePageData } = useCourseContext()
const course = computed(() => coursePageData.value?.course ?? null)
const slug = computed(() => course.value?.slug ?? '')
const canManage = computed(() => Boolean(coursePageData.value?.canManage))

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const c = course.value
  crumbs.value = c
    ? [
        { label: 'Курсы', to: '/' },
        { label: c.title, to: `/courses/${c.slug}` },
        { label: 'Группы' },
      ]
    : [{ label: 'Курсы', to: '/' }]
})

const groups = ref<CourseGroup[]>([])
const error = ref('')

async function load() {
  if (!slug.value) return
  error.value = ''
  try {
    groups.value = await $fetch<CourseGroup[]>(`/api/courses/${slug.value}/groups`)
  } catch (e) {
    error.value = errText(e, 'Не удалось загрузить группы')
  }
}
watch(slug, () => { void load() }, { immediate: true })

// --- создание ---
const newTitle = ref('')
const creating = ref(false)
async function create() {
  if (!slug.value || !newTitle.value.trim() || creating.value) return
  creating.value = true
  error.value = ''
  try {
    const g = await $fetch<CourseGroup>(`/api/courses/${slug.value}/groups`, {
      method: 'POST',
      body: { title: newTitle.value.trim() },
    })
    newTitle.value = ''
    await navigateTo(`/courses/${slug.value}/groups/${g.id}`)
  } catch (e) {
    error.value = errText(e, 'Не удалось создать группу')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div>
    <header class="page-head">
      <h1 class="page-title">Группы</h1>
    </header>

    <p class="muted">
      Группа — подмножество учеников курса: для неё можно назначать свои темы,
      задания и посты ленты. «Публичная» — техническая группа всего курса:
      назначается новым материалам автоматически.
    </p>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="canManage" class="card" style="margin-bottom: 14px;">
      <div class="row" style="gap: 8px;">
        <input
          v-model="newTitle"
          placeholder="Название новой группы…"
          style="flex: 1;"
          @keyup.enter="create"
        >
        <button class="primary" :disabled="creating || !newTitle.trim()" @click="create">
          {{ creating ? '…' : 'Создать' }}
        </button>
      </div>
    </div>

    <p v-if="!groups.length" class="muted">Групп пока нет.</p>

    <div class="row" style="gap: 12px; flex-wrap: wrap;">
      <NuxtLink
        v-for="g in groups"
        :key="g.id"
        :to="`/courses/${slug}/groups/${g.id}`"
        class="card group-card"
      >
        <strong>{{ g.title }}</strong>
        <span class="muted" style="font-size: 12px;">{{ g.members.length }} участн.</span>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.group-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  min-width: 200px;
  text-decoration: none;
  color: inherit;
}
.group-card:hover {
  border-color: var(--accent);
}
</style>
