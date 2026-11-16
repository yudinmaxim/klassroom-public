<script setup lang="ts">
import type { GradebookSection } from '#shared/types'
import { errText } from '#shared/errors'
import { useBreadcrumbs } from '~/composables/useBreadcrumbs'
import { onNotification } from '~/composables/useNotifications'

const crumbs = useBreadcrumbs()
crumbs.value = [{ label: 'Оценки' }]

const { data: me } = await useFetch('/api/auth/me', { key: 'me' })
if (!me.value?.user) await navigateTo('/login', { replace: true })

const sections = ref<GradebookSection[]>([])
const courses = ref<{ slug: string, title: string }[]>([])
const error = ref('')
const filterCourse = ref('')

const visibleSections = computed(() =>
  filterCourse.value ? sections.value.filter(s => s.course.slug === filterCourse.value) : sections.value,
)

async function load() {
  try {
    sections.value = await $fetch<GradebookSection[]>('/api/grades')
    courses.value = sections.value.map(s => s.course)
  } catch (e) {
    error.value = errText(e, 'Не удалось загрузить оценки')
  }
}
onMounted(load)

// live-обновление: оценки/сдачи по любому курсу
onMounted(() => onNotification((n) => {
  if (n.type === 'submission.graded' || n.type === 'submission.created' || n.type === 'roster.changed') {
    void load()
  }
}))

function cellTitle(c: GradebookSection['book']['rows'][number]['cells'][number], a: GradebookSection['book']['assignments'][number]) {
  const parts = [a.title]
  if (a.due) parts.push(`до ${new Date(a.due).toLocaleString('ru')}`)
  if (c.submittedAt) parts.push(`сдано ${new Date(c.submittedAt).toLocaleString('ru')}`)
  if (c.updatedAt && c.status === 'returned') parts.push(`проверено ${new Date(c.updatedAt).toLocaleString('ru')}`)
  return parts.join(' · ')
}
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 16px; gap: 10px; align-items: center;">
      <h1 style="margin: 0;">Оценки</h1>
      <div class="spacer" />
      <select v-model="filterCourse" aria-label="Фильтр по курсу">
        <option value="">Все курсы</option>
        <option v-for="c in courses" :key="c.slug" :value="c.slug">{{ c.title }}</option>
      </select>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="!visibleSections.length" class="muted">Нет курсов с опубликованными заданиями.</p>

    <div v-for="s in visibleSections" :key="s.course.slug" class="card" style="margin-bottom: 16px;">
      <h2 style="margin-top: 0;">
        <NuxtLink :to="`/courses/${s.course.slug}`">{{ s.course.title }}</NuxtLink>
      </h2>
      <p v-if="!s.book.canSeeAll" class="muted" style="margin-top: -8px;">
        Показана только ваша строка.
      </p>

      <div class="table-wrap">
        <table class="table gradebook">
          <thead>
            <tr>
              <th class="gb-student">Ученик</th>
              <th v-for="a in s.book.assignments" :key="a.id" :title="a.due ? `до ${new Date(a.due).toLocaleDateString('ru')}` : ''">
                <NuxtLink :to="`/courses/${s.course.slug}/assignments/${a.slug}`">{{ a.title }}</NuxtLink>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in s.book.rows" :key="row.student" :class="{ 'is-mine': row.mine }">
              <td class="gb-student">{{ row.student }}</td>
              <td
                v-for="(c, i) in row.cells"
                :key="c.assignmentId"
                class="gb-cell"
                :class="`st-${c.status}`"
                :title="cellTitle(c, s.book.assignments[i]!)"
              >
                <template v-if="c.status === 'returned'">
                  <strong v-if="c.grade !== null">{{ c.grade }}</strong>
                  <span v-else class="muted">✓</span>
                  <span v-if="c.maxPoints" class="gb-max">/{{ c.maxPoints }}</span>
                </template>
                <span v-else-if="c.status === 'submitted'" class="muted">…</span>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
}
.gradebook {
  /* separate, не collapse — иначе sticky-колонка глючит с border-collapse */
  border-collapse: separate;
  border-spacing: 0;
  /* ширина по контенту: одна колонка не растягивается на всю карточку */
  width: max-content;
}
.gradebook th,
.gradebook td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  text-align: center;
  white-space: nowrap;
}
.gradebook th {
  font-size: 12px;
  font-weight: 600;
}
.gb-student {
  text-align: left !important;
  font-weight: 500;
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--bg, #fff);
  /* визуальный разделитель между липкой колонкой и скроллящимися */
  box-shadow: 1px 0 0 var(--border, #e5e7eb);
}
tr.is-mine .gb-student {
  color: var(--accent, #2563eb);
}
.gb-cell.st-submitted {
  color: var(--warn, #b45309);
}
.gb-cell.st-returned strong {
  color: var(--ok, #15803d);
}
.gb-max {
  font-size: 11px;
  color: var(--muted, #6b7280);
}
</style>
