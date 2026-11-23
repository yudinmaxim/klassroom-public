<script setup lang="ts">
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'
import { useCourseGroups } from '~/composables/useCourseGroups'
import { onNotification } from '~/composables/useNotifications'

const { data: coursePageData } = useCourseContext()
const course = computed(() => coursePageData.value?.course ?? null)
const canManage = computed(() => coursePageData.value?.canManage ?? false)

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const c = course.value
  crumbs.value = c
    ? [{ label: 'Курсы', to: '/' }, { label: c.title, to: `/courses/${c.slug}` }]
    : [{ label: 'Курсы', to: '/' }]
})

// Ростер — отдельный запрос, только на этой вкладке
const { data: rosterData, refresh: refreshRoster } = await useFetch<{ roster: Array<{ username: string, pseudonym: string }> }>(
  `/api/courses/${course.value?.slug}/roster`,
)
const roster = computed(() => rosterData.value?.roster ?? [])
const rosterUsernames = computed(() => roster.value.map(s => s.username))

// группы курса — для колонки «Группы»
const { groups: courseGroups } = useCourseGroups(computed(() => course.value?.slug ?? ''))
function groupsOf(username: string): string[] {
  return (courseGroups.value ?? [])
    .filter(g => g.members.includes(username))
    .map(g => g.title)
}

// live-обновление состава по SSE-событиям
onMounted(() => onNotification((n) => {
  if (n.course === course.value?.slug && n.type === 'roster.changed') {
    void refreshRoster()
  }
}))

const rosterError = ref('')
const rosterBusy = ref(false)
const enrollOpen = ref(false)
const newStudentOpen = ref(false)
const revealedSecret = ref('')

async function removeStudent(username: string) {
  rosterError.value = ''
  rosterBusy.value = true
  try {
    await $fetch(`/api/courses/${course.value?.slug}/roster`, {
      method: 'POST',
      body: { username, action: 'remove' },
    })
    await refreshRoster()
  } catch (e) {
    rosterError.value = errText(e, 'Не удалось изменить состав курса')
  } finally {
    rosterBusy.value = false
  }
}
</script>

<template>
  <div class="course-page">
  <div class="course-content">
    <div class="card">
      <SectionHead>
        Учащиеся ({{ roster.length }})
        <template v-if="canManage" #actions>
          <AppDropdown>
            <template #trigger>
              <span class="tip">
                <button class="icon-btn" aria-label="Действия с учащимися">
                  <Icon name="lucide:plus" />
                </button>
                <span class="tip-body">Учащиеся</span>
              </span>
            </template>
            <template #menu="{ close }">
              <button @click="enrollOpen = true; close()">Записать учащегося на курс</button>
              <button @click="newStudentOpen = true; close()">Добавить нового учащегося</button>
            </template>
          </AppDropdown>
        </template>
      </SectionHead>

      <p v-if="revealedSecret" class="muted" style="margin-bottom: 6px;">
        Пароль нового ученика (виден один раз):
      </p>
      <div v-if="revealedSecret" class="secret" style="margin-bottom: 10px;">{{ revealedSecret }}</div>
      <button v-if="revealedSecret" class="small" style="margin-bottom: 12px;" @click="revealedSecret = ''">Скрыть</button>

      <p v-if="rosterError" class="error" style="margin-bottom: 12px;">{{ rosterError }}</p>
      <table v-if="roster.length" class="data-table">
        <thead>
          <tr>
            <th>Псевдоним</th>
            <th>Логин</th>
            <th>Группы</th>
            <th v-if="canManage" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in roster" :key="s.username">
            <td>{{ s.pseudonym }}</td>
            <td class="muted">{{ s.username }}</td>
            <td>
              <template v-if="groupsOf(s.username).length">
                <span
                  v-for="t in groupsOf(s.username)"
                  :key="t"
                  class="group-tag"
                >{{ t }}</span>
              </template>
              <span v-else class="muted">—</span>
            </td>
            <td v-if="canManage" class="row-actions">
              <span class="tip">
                <button
                  class="icon-btn danger"
                  aria-label="Исключить из курса"
                  :disabled="rosterBusy"
                  @click="removeStudent(s.username)"
                >
                  <Icon name="lucide:trash-2" />
                </button>
                <span class="tip-body">Исключить</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Учеников пока нет.</p>
    </div>

    <EnrollModal
      v-if="enrollOpen && course"
      :slug="course.slug"
      :enrolled="rosterUsernames"
      @close="enrollOpen = false"
      @changed="enrollOpen = false; refreshRoster()"
    />
    <NewStudentPanel
      v-if="newStudentOpen && course"
      :slug="course.slug"
      @close="newStudentOpen = false"
      @created="(pw) => { revealedSecret = pw ?? ''; newStudentOpen = false; refreshRoster() }"
    />
  </div>
  </div>
</template>

<style scoped>
.group-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--accent-soft, rgba(79, 70, 229, 0.1));
  color: var(--accent, #4f46e5);
  margin: 0 4px 2px 0;
  white-space: nowrap;
}
</style>
