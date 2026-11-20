<script setup lang="ts">
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'
import { onNotification } from '~/composables/useNotifications'
import { chatHasUnread } from '~/composables/useSubmissionChat'

const { data: coursePageData } = useCourseContext()
const course = computed(() => coursePageData.value?.course ?? null)
const canAssignments = computed(() => coursePageData.value?.canAssignments ?? false)

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const c = course.value
  crumbs.value = c
    ? [{ label: 'Курсы', to: '/' }, { label: c.title, to: `/courses/${c.slug}` }]
    : [{ label: 'Курсы', to: '/' }]
})

interface AssignmentRow {
  slug: string
  title: string
  type: 'general' | 'private'
  status: 'draft' | 'published'
  due: string | null
  submissionCount: number
  myStatus?: 'none' | 'submitted' | 'returned'
  myGrade?: number | null
  myLastCommentAt?: string | null
  updatedAt: string
}
const assignments = ref<AssignmentRow[]>([])
const assignmentsError = ref('')

async function loadAssignments() {
  assignmentsError.value = ''
  try {
    const res = await $fetch<{ assignments: AssignmentRow[] }>(
      `/api/courses/${course.value?.slug}/assignments`,
    )
    assignments.value = res.assignments
  } catch (e) {
    assignmentsError.value = errText(e, 'Не удалось загрузить задания')
  }
}
onMounted(() => { if (course.value) void loadAssignments() })

// live-обновление: выдача/отзыв/сдача меняют список и счётчики
onMounted(() => onNotification((n) => {
  if (n.course !== course.value?.slug) return
  if (n.type.startsWith('assignment.') || n.type.startsWith('submission.') || n.type === 'comment.created') {
    void loadAssignments()
  }
}))

function assignmentStatusLabel(a: AssignmentRow): string {
  if (!canAssignments.value) {
    if (a.myStatus === 'submitted' || a.myStatus === 'returned') return 'Есть ответ'
    return a.status === 'published' ? 'Выдано' : 'Не выдано'
  }
  return `${a.status === 'published' ? 'Выдано' : 'Не выдано'} · ответов: ${a.submissionCount}`
}

function openAssignment(a: AssignmentRow) {
  void navigateTo(`/courses/${course.value?.slug}/assignments/${a.slug}`)
}

async function deleteAssignment(a: AssignmentRow) {
  if (!window.confirm(`Удалить задание «${a.title}» вместе со сдачами?`)) return
  assignmentsError.value = ''
  try {
    await $fetch(`/api/courses/${course.value?.slug}/assignments/${a.slug}`, { method: 'DELETE' })
    await loadAssignments()
  } catch (e) {
    assignmentsError.value = errText(e, 'Не удалось удалить задание')
  }
}

// --- выдача задания: выбор аудитории — в модалке ---
const publishTarget = ref<AssignmentRow | null>(null)
const publishBusy = ref('')

function openPublish(a: AssignmentRow) {
  publishTarget.value = a
}

async function unpublishAssignment(a: AssignmentRow) {
  publishBusy.value = a.slug
  assignmentsError.value = ''
  try {
    await $fetch(`/api/courses/${course.value?.slug}/assignments/${a.slug}`, {
      method: 'PATCH',
      body: { status: 'draft' },
    })
    await loadAssignments()
  } catch (e) {
    assignmentsError.value = errText(e, 'Не удалось снять задание с выдачи')
  } finally {
    publishBusy.value = ''
  }
}
</script>

<template>
  <div class="course-page">
  <div class="course-content">
    <div class="card">
      <SectionHead>
        Домашние задания
        <template v-if="canAssignments" #actions>
          <span class="tip">
            <button
              class="icon-btn"
              aria-label="Добавить задание"
              @click="navigateTo(`/courses/${course?.slug}/assignments/new`)"
            >
              <Icon name="lucide:plus" />
            </button>
            <span class="tip-body">Добавить задание</span>
          </span>
        </template>
      </SectionHead>

      <p v-if="assignmentsError" class="error">{{ assignmentsError }}</p>
      <table v-if="assignments.length" class="data-table">
        <thead>
          <tr>
            <th>Задание</th>
            <th>Тип</th>
            <th>Дедлайн</th>
            <th>Статус</th>
            <th v-if="canAssignments" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="a in assignments"
            :key="a.slug"
            class="is-clickable"
            tabindex="0"
            @click="openAssignment(a)"
            @keydown.enter="openAssignment(a)"
          >
            <td>
              <strong>{{ a.title }}</strong>
              <span
                v-if="!canAssignments && chatHasUnread(course?.slug ?? '', a.slug, a.myLastCommentAt)"
                class="unread-dot"
                title="Есть новые комментарии к сдаче"
              />
            </td>
            <td class="muted">{{ a.type === 'private' ? 'частное' : 'общее' }}</td>
            <td class="muted">{{ a.due ?? '—' }}</td>
            <td>
              {{ assignmentStatusLabel(a) }}
              <template v-if="!canAssignments && a.myGrade != null"> · оценка: <strong>{{ a.myGrade }}</strong></template>
            </td>
            <td v-if="canAssignments" class="row-actions">
              <span v-if="a.status === 'draft'" class="tip">
                <button
                  class="icon-btn"
                  aria-label="Выдать задание"
                  :disabled="publishBusy === a.slug"
                  @click.stop="openPublish(a)"
                >
                  <Icon name="lucide:send" />
                </button>
                <span class="tip-body">Выдать</span>
              </span>
              <span v-else class="tip">
                <button
                  class="icon-btn"
                  aria-label="Снять с выдачи"
                  :disabled="publishBusy === a.slug"
                  @click.stop="unpublishAssignment(a)"
                >
                  <Icon name="lucide:eye-off" />
                </button>
                <span class="tip-body">Снять с выдачи</span>
              </span>
              <span class="tip">
                <button
                  class="icon-btn"
                  aria-label="Редактировать задание"
                  @click.stop="navigateTo(`/courses/${course?.slug}/assignments/${a.slug}?edit=1`)"
                >
                  <Icon name="lucide:pencil" />
                </button>
                <span class="tip-body">Редактировать</span>
              </span>
              <span class="tip">
                <button
                  class="icon-btn danger"
                  aria-label="Удалить задание"
                  @click.stop="deleteAssignment(a)"
                >
                  <Icon name="lucide:trash-2" />
                </button>
                <span class="tip-body">Удалить</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Заданий пока нет.</p>
    </div>

    <PublishAssignmentModal
      v-if="publishTarget && course"
      :slug="course.slug"
      :assignment-slug="publishTarget.slug"
      :title="publishTarget.title"
      @close="publishTarget = null"
      @changed="publishTarget = null; loadAssignments()"
    />
  </div>
  </div>
</template>

<style scoped>
td { position: relative; }
.unread-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-left: 6px;
  border-radius: 50%;
  background: var(--danger, #b23a3a);
  vertical-align: middle;
}
</style>
