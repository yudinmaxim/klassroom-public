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
    // ростер нужен и менеджеру (комбобокс), и читателю (псевдонимы в чипах)
    const res = await $fetch<{ roster: RosterEntry[] }>(`/api/courses/${slug.value}/roster`)
    roster.value = res.roster
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
const memberBusy = ref(false)
function dirty(g: CourseGroup): boolean {
  const d = drafts.value[g.id]
  return !!d && d.title.trim() !== g.title
}
async function save(g: CourseGroup) {
  const d = drafts.value[g.id]
  if (!d || savingId.value) return
  savingId.value = g.id
  error.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/groups/${g.id}`, {
      method: 'PATCH',
      body: { title: d.title.trim() },
    })
    await load()
  } catch (e) {
    error.value = errText(e, 'Не удалось сохранить группу')
  } finally {
    savingId.value = ''
  }
}

// --- участники: чипы + комбобокс добавления ---
const addFor = ref('') // id группы с открытым комбобоксом
const memberQuery = ref('')

function pseudonymOf(username: string): string {
  return roster.value.find(r => r.username === username)?.pseudonym ?? username
}

/** Кандидаты в группу: roster минус уже состоящие, фильтр по поиску. */
function candidates(g: CourseGroup) {
  const q = memberQuery.value.trim().toLowerCase()
  return roster.value.filter(r =>
    !g.members.includes(r.username)
    && (!q || r.username.toLowerCase().includes(q) || r.pseudonym.toLowerCase().includes(q)),
  )
}

/** Состав меняется сразу (PATCH members); название — отдельной кнопкой. */
async function patchMembers(g: CourseGroup, members: string[]) {
  if (memberBusy.value) return
  memberBusy.value = true
  error.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/groups/${g.id}`, {
      method: 'PATCH',
      body: { members },
    })
    const fresh = await $fetch<CourseGroup[]>(`/api/courses/${slug.value}/groups`)
    groups.value = fresh
    drafts.value = Object.fromEntries(
      fresh.map(x => [x.id, { title: x.title, members: [...x.members] }]),
    )
  } catch (e) {
    error.value = errText(e, 'Не удалось обновить состав')
  } finally {
    memberBusy.value = false
  }
}

function addMember(g: CourseGroup, username: string) {
  void patchMembers(g, [...g.members, username])
  memberQuery.value = ''
  addFor.value = ''
}
function removeMember(g: CourseGroup, username: string) {
  void patchMembers(g, g.members.filter(u => u !== username))
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

        <div style="margin-top: 10px;">
          <div class="row" style="gap: 6px; flex-wrap: wrap; align-items: center;">
            <span
              v-for="u in g.members"
              :key="u"
              class="member-chip"
            >
              {{ pseudonymOf(u) }}
              <span class="muted" style="font-size: 10px;">{{ u }}</span>
              <button
                v-if="isManager"
                class="member-x"
                :disabled="memberBusy"
                aria-label="Убрать из группы"
                @click="removeMember(g, u)"
              >×</button>
            </span>
            <span v-if="!g.members.length" class="muted" style="font-size: 12px;">пусто</span>
            <span v-if="isManager" style="position: relative;">
              <button
                class="small"
                :disabled="memberBusy"
                @click="addFor = addFor === g.id ? '' : g.id; memberQuery = ''"
              >
                + Участник
              </button>
              <div v-if="addFor === g.id" class="member-combo">
                <input
                  v-model="memberQuery"
                  placeholder="Поиск по имени или логину…"
                  autofocus
                  @keydown.esc="addFor = ''"
                >
                <div class="member-combo-list">
                  <button
                    v-for="r in candidates(g)"
                    :key="r.username"
                    class="member-combo-item"
                    @click="addMember(g, r.username)"
                  >
                    {{ r.pseudonym }}
                    <span class="muted" style="font-size: 11px;">{{ r.username }}</span>
                  </button>
                  <p v-if="!candidates(g).length" class="muted" style="margin: 6px; font-size: 12px;">
                    {{ memberQuery ? 'Никого не найдено' : 'Все участники уже в группе' }}
                  </p>
                </div>
              </div>
            </span>
          </div>
          <div v-if="isManager" class="row" style="gap: 8px; margin-top: 10px;">
            <button
              class="small primary"
              :disabled="savingId === g.id || !dirty(g) || !drafts[g.id]?.title.trim()"
              @click="save(g)"
            >
              {{ savingId === g.id ? '…' : 'Сохранить название' }}
            </button>
            <button class="small" @click="deleteTarget = g">Удалить группу</button>
          </div>
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

<style scoped>
.member-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--accent-soft, rgba(79, 70, 229, 0.1));
  color: var(--accent, #4f46e5);
  white-space: nowrap;
}
.member-x {
  border: none;
  background: none;
  color: inherit;
  font-size: 14px;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
  opacity: 0.6;
}
.member-x:hover:not(:disabled) { opacity: 1; }
.member-combo {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  width: 260px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 8px;
}
.member-combo input {
  width: 100%;
  margin-bottom: 6px;
}
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
