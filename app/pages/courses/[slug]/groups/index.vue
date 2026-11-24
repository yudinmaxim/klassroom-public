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

// --- создание (модалка) ---
const createOpen = ref(false)
const newTitle = ref('')
const creating = ref(false)
const createError = ref('')

function openCreate() {
  newTitle.value = ''
  createError.value = ''
  createOpen.value = true
}
async function create() {
  if (!slug.value || !newTitle.value.trim() || creating.value) return
  creating.value = true
  createError.value = ''
  try {
    const g = await $fetch<CourseGroup>(`/api/courses/${slug.value}/groups`, {
      method: 'POST',
      body: { title: newTitle.value.trim() },
    })
    createOpen.value = false
    await navigateTo(`/courses/${slug.value}/groups/${g.id}`)
  } catch (e) {
    createError.value = errText(e, 'Не удалось создать группу')
  } finally {
    creating.value = false
  }
}

function openGroup(g: CourseGroup) {
  void navigateTo(`/courses/${slug.value}/groups/${g.id}`)
}
</script>

<template>
  <div>
    <div class="card">
      <SectionHead>
        Группы
        <template v-if="canManage" #actions>
          <span class="tip">
            <button class="icon-btn" aria-label="Создать группу" @click="openCreate">
              <Icon name="lucide:plus" />
            </button>
            <span class="tip-body">Создать группу</span>
          </span>
        </template>
      </SectionHead>

      <p class="muted" style="margin-top: -6px;">
        Подмножества учеников курса для отдельных тем, заданий и постов ленты.
      </p>

      <p v-if="error" class="error">{{ error }}</p>
      <table v-if="groups.length" class="data-table">
        <thead>
          <tr>
            <th>Группа</th>
            <th>Участников</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="g in groups"
            :key="g.id"
            class="is-clickable"
            tabindex="0"
            @click="openGroup(g)"
            @keydown.enter="openGroup(g)"
          >
            <td><strong>{{ g.title }}</strong></td>
            <td class="muted">{{ g.members.length }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Групп пока нет.</p>
    </div>

    <div v-if="createOpen" class="modal-backdrop" @click.self="createOpen = false">
      <div class="modal" style="width: min(400px, calc(100vw - 32px));">
        <div class="modal-head">
          <h2>Новая группа</h2>
          <button class="icon-btn" aria-label="Закрыть" @click="createOpen = false">
            <Icon name="lucide:x" />
          </button>
        </div>
        <label>
          Название
          <input
            v-model="newTitle"
            placeholder="Например: Сильные"
            @keyup.enter="create"
          >
        </label>
        <p v-if="createError" class="error" style="margin-top: 8px;">{{ createError }}</p>
        <div class="modal-foot">
          <button @click="createOpen = false">Отмена</button>
          <button
            class="primary"
            :disabled="creating || !newTitle.trim()"
            @click="create"
          >
            {{ creating ? 'Создаю…' : 'Создать' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
