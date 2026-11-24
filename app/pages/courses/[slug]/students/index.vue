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

// группы курса — для колонки «Группы» и действия «Добавить в группу»
const { groups: courseGroups, refresh: refreshGroups } = useCourseGroups(computed(() => course.value?.slug ?? ''))
function groupsOf(username: string): string[] {
  return (courseGroups.value ?? [])
    .filter(g => g.members.includes(username))
    .map(g => g.title)
}

// --- добавление ученика в группу ---
const groupBusy = ref(false)
async function addToGroup(username: string, groupId: string) {
  const g = (courseGroups.value ?? []).find(x => x.id === groupId)
  if (!g || g.members.includes(username) || groupBusy.value) return
  groupBusy.value = true
  rosterError.value = ''
  try {
    await $fetch(`/api/courses/${course.value?.slug}/groups/${groupId}`, {
      method: 'PATCH',
      body: { members: [...g.members, username] },
    })
    await refreshGroups()
  } catch (e) {
    rosterError.value = errText(e, 'Не удалось добавить в группу')
  } finally {
    groupBusy.value = false
  }
}

// создание группы с предустановленным учеником
const newGroupFor = ref('')
const newGroupTitle = ref('')
const newGroupBusy = ref(false)
const newGroupError = ref('')
function openNewGroup(username: string) {
  newGroupFor.value = username
  newGroupTitle.value = ''
  newGroupError.value = ''
}
async function createGroupWithStudent() {
  if (!newGroupFor.value || !newGroupTitle.value.trim() || newGroupBusy.value) return
  newGroupBusy.value = true
  newGroupError.value = ''
  try {
    await $fetch(`/api/courses/${course.value?.slug}/groups`, {
      method: 'POST',
      body: { title: newGroupTitle.value.trim(), members: [newGroupFor.value] },
    })
    newGroupFor.value = ''
    await refreshGroups()
  } catch (e) {
    newGroupError.value = errText(e, 'Не удалось создать группу')
  } finally {
    newGroupBusy.value = false
  }
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
              <IconBtn icon="lucide:plus" label="Учащиеся" />
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
              <AppDropdown>
                <template #trigger>
                  <IconBtn icon="lucide:user-plus" label="В группу" :disabled="groupBusy" />
                </template>
                <template #menu="{ close }">
                  <button
                    v-for="g in courseGroups ?? []"
                    :key="g.id"
                    :disabled="g.members.includes(s.username)"
                    @click="addToGroup(s.username, g.id); close()"
                  >
                    {{ g.title }}
                    <span v-if="g.members.includes(s.username)" class="muted">· уже в группе</span>
                  </button>
                  <button @click="openNewGroup(s.username); close()">
                    + Новая группа…
                  </button>
                </template>
              </AppDropdown>
              <IconBtn
                icon="lucide:trash-2"
                label="Исключить"
                danger
                :disabled="rosterBusy"
                @click="removeStudent(s.username)"
              />
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

    <BaseModal
      v-if="newGroupFor"
      title="Новая группа"
      width="min(380px, calc(100vw - 32px))"
      @close="newGroupFor = ''"
    >
      <p class="muted" style="margin: 0 0 10px;">
        Ученик будет добавлен в группу сразу после создания.
      </p>
      <input
        v-model="newGroupTitle"
        placeholder="Название группы…"
        @keyup.enter="createGroupWithStudent"
      >
      <p v-if="newGroupError" class="error" style="margin-top: 8px;">{{ newGroupError }}</p>
      <template #foot>
        <button @click="newGroupFor = ''">Отмена</button>
        <button
          class="primary"
          :disabled="newGroupBusy || !newGroupTitle.trim()"
          @click="createGroupWithStudent"
        >
          {{ newGroupBusy ? '…' : 'Создать' }}
        </button>
      </template>
    </BaseModal>
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
