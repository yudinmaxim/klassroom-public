<script setup lang="ts">
import type { Gradebook } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'
import { onNotification } from '~/composables/useNotifications'

const { data: coursePageData } = useCourseContext()
const course = computed(() => coursePageData.value?.course ?? null)

const book = ref<Gradebook | null>(null)
const error = ref('')

async function load() {
  if (!course.value) return
  try {
    book.value = await $fetch<Gradebook>(`/api/courses/${course.value.slug}/grades`)
  } catch (e) {
    error.value = errText(e, 'Не удалось загрузить журнал')
  }
}
onMounted(load)

// live-обновление: оценки/сдачи/состав курса
onMounted(() => onNotification((n) => {
  if (n.course !== course.value?.slug) return
  if (n.type === 'submission.graded' || n.type === 'submission.created' || n.type === 'roster.changed') {
    void load()
  }
}))

function cellTitle(c: Gradebook['rows'][number]['cells'][number], a: Gradebook['assignments'][number]) {
  const parts = [a.title]
  if (a.due) parts.push(`до ${new Date(a.due).toLocaleString('ru')}`)
  if (c.submittedAt) parts.push(`сдано ${new Date(c.submittedAt).toLocaleString('ru')}`)
  if (c.updatedAt && c.status === 'returned') parts.push(`проверено ${new Date(c.updatedAt).toLocaleString('ru')}`)
  return parts.join(' · ')
}
</script>

<template>
  <div class="course-page">
    <div class="course-content">
      <div class="card">
        <h2 style="margin-top: 0;">Журнал оценок</h2>
        <p v-if="!book?.canSeeAll" class="muted" style="margin-top: 0;">
          Вы видите только свою строку.
        </p>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-else-if="book && !book.assignments.length" class="muted">
          Пока нет опубликованных заданий.
        </p>

        <div v-else-if="book" class="table-wrap">
          <table class="table gradebook">
            <thead>
              <tr>
                <th class="gb-student">Ученик</th>
                <th v-for="a in book.assignments" :key="a.id" :title="a.due ? `до ${new Date(a.due).toLocaleDateString('ru')}` : ''">
                  <NuxtLink :to="`/courses/${course?.slug}/assignments/${a.slug}`">{{ a.title }}</NuxtLink>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in book.rows" :key="row.student" :class="{ 'is-mine': row.mine }">
                <td class="gb-student">{{ row.student }}</td>
                <td
                  v-for="(c, i) in row.cells"
                  :key="c.assignmentId"
                  class="gb-cell"
                  :class="`st-${c.status}`"
                  :title="cellTitle(c, book.assignments[i]!)"
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
  </div>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
}
.gradebook {
  border-collapse: collapse;
  width: 100%;
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
  background: var(--bg, #fff);
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
