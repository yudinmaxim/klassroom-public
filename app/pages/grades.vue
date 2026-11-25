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

const exportAvailable = computed(() => visibleSections.value.some(s => s.book.canSeeAll))

function exportUrl(format: 'csv' | 'md') {
  const params = new URLSearchParams({ format })
  if (filterCourse.value) params.set('course', filterCourse.value)
  return `/api/grades/export?${params}`
}

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

/** Средний балл строки: среднее (grade/maxPoints*100) по проверенным работам. */
function rowAverage(row: GradebookSection['book']['rows'][number], book: GradebookSection['book']) {
  const parts: number[] = []
  row.cells.forEach((c, i) => {
    const a = book.assignments[i]
    if (c.status !== 'returned' || c.grade === null) return
    parts.push(a?.maxPoints ? (c.grade / a.maxPoints) * 100 : c.grade)
  })
  if (!parts.length) return null
  return Math.round(parts.reduce((s, v) => s + v, 0) / parts.length)
}

function avgClass(avg: number | null) {
  if (avg === null) return ''
  if (avg >= 80) return 'avg-good'
  if (avg >= 55) return 'avg-mid'
  return 'avg-bad'
}
</script>

<template>
  <PageShell>
    <template #title>Оценки</template>
    <template #actions>
      <select v-model="filterCourse" aria-label="Фильтр по курсу">
        <option value="">Все курсы</option>
        <option v-for="c in courses" :key="c.slug" :value="c.slug">{{ c.title }}</option>
      </select>
      <template v-if="exportAvailable">
        <span class="muted">Экспорт:</span>
        <a class="small" :href="exportUrl('csv')">CSV</a>
        <a class="small" :href="exportUrl('md')">MD</a>
      </template>
    </template>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="!visibleSections.length" class="muted">Нет курсов с опубликованными заданиями.</p>

    <div v-for="s in visibleSections" :key="s.course.slug" class="card gb-card" style="margin-bottom: 16px;">
      <div class="gb-course-head">
        <h2 style="margin: 0;">
          Курс: <NuxtLink :to="`/courses/${s.course.slug}`">{{ s.course.title }}</NuxtLink>
        </h2>
        <span v-if="s.book.canSeeAll" class="gb-stats">
          Учеников: {{ s.book.rows.length }}
        </span>
      </div>
      <div class="table-wrap">
        <table class="table gradebook">
          <thead>
            <tr>
              <th v-if="s.book.canSeeAll" class="gb-student">Ученик</th>
              <th v-for="a in s.book.assignments" :key="a.id" class="gb-asg" :title="a.due ? `до ${new Date(a.due).toLocaleDateString('ru')}` : ''">
                <NuxtLink :to="`/courses/${s.course.slug}/assignments/${a.id}`" class="gb-asg-link">
                  <span class="gb-asg-title">{{ a.title }}</span>
                  <span v-if="a.due" class="gb-asg-due">до {{ new Date(a.due).toLocaleDateString('ru') }}</span>
                </NuxtLink>
              </th>
              <th v-if="s.book.canSeeAll" class="gb-avg">Средний</th>
            </tr>
          </thead>
          <tbody>
            <!-- учитель: строка на каждого ученика -->
            <template v-if="s.book.canSeeAll">
              <tr v-for="row in s.book.rows" :key="row.student">
                <td class="gb-student">
                  <span class="gb-who">
                    <span class="avatar avatar-xs" aria-hidden="true">{{ (row.name ?? row.student).slice(0, 1).toUpperCase() }}</span>
                    <span class="gb-who-text">
                      <span class="gb-who-name">{{ row.name ?? row.student }}</span>
                      <span class="gb-who-login muted">{{ row.student }}</span>
                    </span>
                  </span>
                </td>
                <td
                  v-for="(c, i) in row.cells"
                  :key="c.assignmentId"
                  class="gb-cell"
                  :title="cellTitle(c, s.book.assignments[i]!)"
                >
                  <span v-if="c.status === 'returned'" class="gb-badge" :class="c.grade !== null ? 'ok' : 'done'">
                    <template v-if="c.grade !== null">{{ c.grade }}<small v-if="c.maxPoints">/{{ c.maxPoints }}</small></template>
                    <template v-else>✓</template>
                  </span>
                  <span v-else-if="c.status === 'submitted'" class="gb-badge wait">…</span>
                  <span v-else class="gb-none">—</span>
                </td>
                <td class="gb-avg">
                  <span v-if="rowAverage(row, s.book) !== null" class="gb-avg-val" :class="avgClass(rowAverage(row, s.book))">
                    {{ rowAverage(row, s.book) }}%
                  </span>
                  <span v-else class="gb-none">—</span>
                </td>
              </tr>
            </template>
            <!-- ученик: одна строка оценок без колонки-метки -->
            <tr v-else-if="s.book.rows[0]">
              <td
                v-for="(c, i) in s.book.rows[0].cells"
                :key="c.assignmentId"
                class="gb-cell"
                :title="cellTitle(c, s.book.assignments[i]!)"
              >
                <span v-if="c.status === 'returned'" class="gb-badge" :class="c.grade !== null ? 'ok' : 'done'">
                  <template v-if="c.grade !== null">{{ c.grade }}<small v-if="c.maxPoints">/{{ c.maxPoints }}</small></template>
                  <template v-else>✓</template>
                </span>
                <span v-else-if="c.status === 'submitted'" class="gb-badge wait">…</span>
                <span v-else class="gb-none">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
}
.gb-card { padding: 18px 20px 10px; }
.gb-course-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.gb-stats { font-size: 13px; color: var(--muted); white-space: nowrap; }

.gradebook {
  /* separate, не collapse — иначе sticky-колонка глючит с border-collapse */
  border-collapse: separate;
  border-spacing: 0;
  width: max-content;
}
.gradebook th,
.gradebook td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  text-align: center;
  white-space: nowrap;
}
.gradebook tbody tr:last-child td { border-bottom: none; }
.gradebook tbody tr:nth-child(even) td { background: var(--bg-soft); }
.gradebook tbody tr:hover td { background: color-mix(in srgb, var(--accent) 6%, var(--bg-soft)); }

.gradebook th {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}
.gb-asg-link {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-decoration: none;
  color: var(--ink);
  max-width: 140px;
}
.gb-asg-link:hover .gb-asg-title { color: var(--accent); text-decoration: underline; }
.gb-asg-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}
.gb-asg-due { font-size: 10px; font-weight: 400; color: var(--muted); text-transform: none; letter-spacing: 0; }

.gb-student {
  text-align: left !important;
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--card);
  /* визуальный разделитель между липкой колонкой и скроллящимися */
  box-shadow: 1px 0 0 var(--line);
}
.gradebook thead .gb-student { background: var(--card); }
.gradebook tbody tr:nth-child(even) .gb-student { background: var(--card); }
.gradebook tbody tr:hover .gb-student { background: color-mix(in srgb, var(--accent) 6%, var(--card)); }

.gb-who {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}
.gb-who-text { display: flex; flex-direction: column; line-height: 1.25; }
.gb-who-name { font-size: 13px; }
.gb-who-login { font-size: 11px; }
.avatar-xs {
  width: 22px;
  height: 22px;
  font-size: 10px;
  border-radius: 7px;
}

.gb-badge {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 1px;
  min-width: 34px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}
.gb-badge small { font-size: 10px; font-weight: 500; opacity: 0.75; }
.gb-badge.ok {
  background: color-mix(in srgb, var(--ok) 14%, #fff);
  color: var(--ok);
}
.gb-badge.done {
  background: color-mix(in srgb, var(--ok) 10%, #fff);
  color: var(--ok);
}
.gb-badge.wait {
  background: color-mix(in srgb, var(--warn) 30%, #fff);
  color: var(--warn-ink);
}
.gb-none { color: var(--muted); opacity: 0.5; }

.gb-avg { font-weight: 600; }
.gb-avg-val { font-size: 13px; }
.avg-good { color: var(--ok); }
.avg-mid { color: var(--accent); }
.avg-bad { color: var(--danger); }
</style>
