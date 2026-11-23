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

interface RosterEntry { username: string, pseudonym: string }
const groups = ref<CourseGroup[]>([])
const roster = ref<RosterEntry[]>([])
const error = ref('')

// черновики редактирования: id группы → { title, members }
interface Draft { title: string, members: string[] }
const drafts = ref<Record<string, Draft>>({})

const isManager = computed(() => canManage.value)

async function load() {
  if (!slug.value) return
  error.value = ''
  try {
    groups.value = await $fetch<CourseGroup[]>(`/api/courses/${slug.value}/groups`)
    drafts.value = Object.fromEntries(
      groups.value.map(g => [g.id, { title: g.title, members: [...g.members] }]),
    )
    if (isManager.value) {
      const res = await $fetch<{ roster: RosterEntry[] }>(`/api/courses/${slug.value}/roster`)
      roster.value = res.roster
    }
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
    await $fetch(`/api/courses/${slug.value}/groups`, {
      method: 'POST',
      body: { title: newTitle.value.trim() },
    })
    newTitle.value = ''
    await load()
  } catch (e) {
    error.value = errText(e, 'Не удалось создать группу')
  } finally {
    creating.value = false
  }
}

// --- редактирование ---
const savingId = ref('')
function dirty(g: CourseGroup): boolean {
  const d = drafts.value[g.id]
  return !!d && (d.title.trim() !== g.title || d.members.slice().sort().join() !== g.members.slice().sort().join())
}
function toggleMember(gid: string, username: string) {
  const d = drafts.value[gid]
  if (!d) return
  d.members = d.members.includes(username)
    ? d.members.filter(u => u !== username)
    : [...d.members, username]
}
async function save(g: CourseGroup) {
  const d = drafts.value[g.id]
  if (!d || savingId.value) return
  savingId.value = g.id
  error.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/groups/${g.id}`, {
      method: 'PATCH',
      body: { title: d.title.trim(), members: d.members },
    })
    await load()
  } catch (e) {
    error.value = errText(e, 'Не удалось сохранить группу')
  } finally {
    savingId.value = ''
  }
}

// --- удаление ---
const deleteTarget = ref<CourseGroup | null>(null)
const deleting = ref(false)
async function remove() {
  const g = deleteTarget.value
  if (!g || deleting.value) return
  deleting.value = true
  error.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/groups/${g.id}`, { method: 'DELETE' })
    deleteTarget.value = null
    await load()
  } catch (e) {
    error.value = errText(e, 'Не удалось удалить группу')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="course-page">
    <div class="course-content">
      <header class="page-head">
        <h1 class="page-title">Группы</h1>
      </header>

      <p class="muted">
        Группа — подмножество учеников курса: для неё можно назначать свои темы,
        задания и посты ленты. «Публичная» — техническая группа всего курса:
        назначается новым материалам автоматически.
      </p>

      <p v-if="error" class="error">{{ error }}</p>

      <div v-if="isManager" class="card" style="margin-bottom: 14px;">
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

      <div v-for="g in groups" :key="g.id" class="card" style="margin-bottom: 12px; padding: 12px 14px;">
        <div class="row" style="align-items: center; justify-content: space-between;">
          <template v-if="isManager">
            <input
              v-model="drafts[g.id].title"
              style="font-weight: 600; flex: 1; max-width: 320px;"
            >
            <span class="muted" style="font-size: 12px;">
              {{ g.members.length }} участн.
            </span>
          </template>
          <template v-else>
            <strong>{{ g.title }}</strong>
            <span class="muted" style="font-size: 12px;">{{ g.members.length }} участн.</span>
          </template>
        </div>

        <div v-if="isManager" style="margin-top: 10px;">
          <span class="muted" style="font-size: 12px;">Участники:</span>
          <div class="row" style="gap: 10px 16px; flex-wrap: wrap; margin-top: 4px;">
            <label v-for="r in roster" :key="r.username" class="check">
              <input
                type="checkbox"
                :checked="drafts[g.id]?.members.includes(r.username)"
                @change="toggleMember(g.id, r.username)"
              >
              {{ r.pseudonym }}
              <span class="muted" style="font-size: 11px;">{{ r.username }}</span>
            </label>
            <span v-if="!roster.length" class="muted" style="font-size: 12px;">Ростер пуст.</span>
          </div>
          <div class="row" style="gap: 8px; margin-top: 10px;">
            <button
              class="small primary"
              :disabled="savingId === g.id || !dirty(g) || !drafts[g.id]?.title.trim()"
              @click="save(g)"
            >
              {{ savingId === g.id ? '…' : 'Сохранить' }}
            </button>
            <button class="small" @click="deleteTarget = g">Удалить группу</button>
          </div>
        </div>
        <div v-else style="margin-top: 8px;">
          <span class="muted" style="font-size: 12px;">
            {{ g.members.map(u => roster.find(r => r.username === u)?.pseudonym ?? u).join(', ') || '—' }}
          </span>
        </div>
      </div>
    </div>

    <ConfirmModal
      v-if="deleteTarget"
      title="Удалить группу?"
      :message="`«${deleteTarget.title}» будет удалена. Назначенные ей темы, задания и посты не удалятся — они станут «безгрупповыми» и будут скрыты от учеников до переназначения.`"
      confirm-label="Удалить"
      danger
      @confirm="remove"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
