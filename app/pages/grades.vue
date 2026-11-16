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
const error = ref('')

async function load() {
  try {
    sections.value = await $fetch<GradebookSection[]>('/api/grades')
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
    <div class="row" style="margin-bottom: 16px;">
      <h1 style="margin: 0;">Оценки</h1>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="!sections.length" class="muted">Нет курсов с опубликованными заданиями.</p>

    <div v-for="s in sections" :key="s.course.slug" class="card" style="margin-bottom: 16px;">
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
