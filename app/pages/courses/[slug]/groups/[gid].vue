<script setup lang="ts">
import type { CourseGroup } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'

const route = useRoute()
const { data: coursePageData } = useCourseContext()
const course = computed(() => coursePageData.value?.course ?? null)
const slug = computed(() => course.value?.slug ?? '')
const gid = computed(() => String(route.params.gid))
const canManage = computed(() => Boolean(coursePageData.value?.canManage))

interface RosterEntry { username: string, pseudonym: string }
const group = ref<CourseGroup | null>(null)
const roster = ref<RosterEntry[]>([])
const error = ref('')

async function load() {
  if (!slug.value || !gid.value) return
  error.value = ''
  try {
    const all = await $fetch<CourseGroup[]>(`/api/courses/${slug.value}/groups`)
    group.value = all.find(g => g.id === gid.value) ?? null
    if (!group.value) {
      error.value = 'Группа не найдена'
      return
    }
    const res = await $fetch<{ roster: RosterEntry[] }>(`/api/courses/${slug.value}/roster`)
    roster.value = res.roster
  } catch (e) {
    error.value = errText(e, 'Не удалось загрузить группу')
  }
}
watch([slug, gid], () => { void load() }, { immediate: true })

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const c = course.value
  crumbs.value = c
    ? [
        { label: 'Курсы', to: '/' },
        { label: c.title, to: `/courses/${c.slug}` },
        { label: 'Группы', to: `/courses/${c.slug}/groups` },
        { label: group.value?.title ?? '…' },
      ]
    : [{ label: 'Курсы', to: '/' }]
})

// --- название ---
const titleDraft = ref('')
const savingTitle = ref(false)
watch(group, (g) => { if (g) titleDraft.value = g.title }, { immediate: true })
const titleDirty = computed(() => !!group.value && titleDraft.value.trim() !== '' && titleDraft.value.trim() !== group.value.title)
async function saveTitle() {
  if (!group.value || !titleDirty.value || savingTitle.value) return
  savingTitle.value = true
  error.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/groups/${gid.value}`, {
      method: 'PATCH',
      body: { title: titleDraft.value.trim() },
    })
    await load()
  } catch (e) {
    error.value = errText(e, 'Не удалось переименовать группу')
  } finally {
    savingTitle.value = false
  }
}

// --- участники ---
const memberBusy = ref(false)
function pseudo(u: string) { return roster.value.find(r => r.username === u)?.pseudonym ?? u }

/** Кандидаты: roster минус члены группы, фильтр по поиску. */
const addOpen = ref(false)
const memberQuery = ref('')
function candidates() {
  const q = memberQuery.value.trim().toLowerCase()
  const members = group.value?.members ?? []
  return roster.value.filter(r =>
    !members.includes(r.username)
    && (!q || r.username.toLowerCase().includes(q) || r.pseudonym.toLowerCase().includes(q)),
  )
}

async function patchMembers(members: string[]) {
  if (!group.value || memberBusy.value) return
  memberBusy.value = true
  error.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/groups/${gid.value}`, {
      method: 'PATCH',
      body: { members },
    })
    await load()
  } catch (e) {
    error.value = errText(e, 'Не удалось обновить состав')
  } finally {
    memberBusy.value = false
  }
}
function addMember(username: string) {
  if (!group.value) return
  void patchMembers([...group.value.members, username])
  memberQuery.value = ''
  addOpen.value = false
}
function removeMember(username: string) {
  if (!group.value) return
  void patchMembers(group.value.members.filter(u => u !== username))
}

// --- удаление ---
const deleteOpen = ref(false)
const deleting = ref(false)
async function remove() {
  if (!group.value || deleting.value) return
  deleting.value = true
  error.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/groups/${gid.value}`, { method: 'DELETE' })
    await navigateTo(`/courses/${slug.value}/groups`)
  } catch (e) {
    error.value = errText(e, 'Не удалось удалить группу')
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="group">
    <header class="page-head">
      <h1 class="page-title">{{ group.title }}</h1>
      <div v-if="canManage" class="page-actions">
        <button class="small" @click="deleteOpen = true">Удалить группу</button>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="canManage" class="card" style="margin-bottom: 14px;">
      <div class="row" style="gap: 8px; align-items: center;">
        <input
          v-model="titleDraft"
          placeholder="Название группы"
          style="max-width: 320px;"
          @keyup.enter="saveTitle"
        >
        <button
          class="small primary"
          :disabled="savingTitle || !titleDirty"
          @click="saveTitle"
        >
          {{ savingTitle ? '…' : 'Сохранить' }}
        </button>
      </div>
    </div>

    <div class="card">
      <SectionHead>
        Участники ({{ group.members.length }})
        <template v-if="canManage" #actions>
          <span style="position: relative;">
            <button class="small" @click="addOpen = !addOpen; memberQuery = ''">
              + Участник
            </button>
            <div v-if="addOpen" class="member-combo">
              <input
                v-model="memberQuery"
                placeholder="Поиск по имени или логину…"
                autofocus
                @keydown.esc="addOpen = false"
              >
              <div class="member-combo-list">
                <button
                  v-for="r in candidates()"
                  :key="r.username"
                  class="member-combo-item"
                  @click="addMember(r.username)"
                >
                  {{ r.pseudonym }}
                  <span class="muted" style="font-size: 11px;">{{ r.username }}</span>
                </button>
                <p v-if="!candidates().length" class="muted" style="margin: 6px; font-size: 12px;">
                  {{ memberQuery ? 'Никого не найдено' : 'Все участники уже в группе' }}
                </p>
              </div>
            </div>
          </span>
        </template>
      </SectionHead>

      <table v-if="group.members.length" class="data-table">
        <thead>
          <tr>
            <th>Псевдоним</th>
            <th>Логин</th>
            <th v-if="canManage" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in group.members" :key="u">
            <td>{{ pseudo(u) }}</td>
            <td class="muted">{{ u }}</td>
            <td v-if="canManage" class="row-actions">
              <span class="tip">
                <button
                  class="icon-btn danger"
                  aria-label="Убрать из группы"
                  :disabled="memberBusy"
                  @click="removeMember(u)"
                >
                  <Icon name="lucide:trash-2" />
                </button>
                <span class="tip-body">Убрать</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">В группе пока никого нет.</p>
    </div>

    <ConfirmModal
      v-if="deleteOpen"
      title="Удалить группу?"
      :message="`«${group.title}» будет удалена. Назначенные ей темы, задания и посты не удалятся — они станут «безгрупповыми» и будут скрыты от учеников до переназначения.`"
      confirm-label="Удалить"
      danger
      @confirm="remove"
      @cancel="deleteOpen = false"
    />
  </div>
  <p v-else-if="error" class="error">{{ error }}</p>
</template>

<style scoped>
.member-combo {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  width: 260px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 8px;
}
.member-combo input { width: 100%; margin-bottom: 6px; }
.member-combo-list {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.member-combo-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  background: none;
  text-align: left;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.member-combo-item:hover { background: var(--accent-soft, rgba(79, 70, 229, 0.08)); }
</style>
