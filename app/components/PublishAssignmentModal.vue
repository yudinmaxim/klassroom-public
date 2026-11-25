<script setup lang="ts">
import { errText } from '#shared/errors'
import { PUBLIC_GROUP } from '#shared/types'

const props = defineProps<{
  slug: string
  assignmentId: string
  title: string
}>()
const emit = defineEmits<{ close: [], changed: [] }>()

/** Кому выдаём: всем ученикам курса или выбранным. */
const scope = ref<'all' | 'chosen'>('all')
const checked = ref<Set<string>>(new Set())
const selectedGroups = ref<string[]>([PUBLIC_GROUP])
const search = ref('')
const students = ref<Array<{ username: string, pseudonym: string }>>([])
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    // ростер — только если есть courses.roster.view; иначе список пуст
    const [res, rosterRes] = await Promise.all([
      $fetch<{ assignment: { type: string, audience: string[], status: string, groups?: string[] } }>(
        `/api/courses/${props.slug}/assignments/${props.assignmentId}`,
      ),
      $fetch<{ roster: typeof students.value }>(`/api/courses/${props.slug}/roster`).catch(() => null),
    ])
    students.value = rosterRes?.roster ?? []
    // префилл: частное выданное задание → выбранные; иначе → всем
    if (res.assignment.type === 'private' && res.assignment.audience.length) {
      scope.value = 'chosen'
      checked.value = new Set(res.assignment.audience)
    }
    if (res.assignment.groups?.length) selectedGroups.value = res.assignment.groups
  } catch (e) {
    loadError.value = errText(e, 'Не удалось загрузить задание')
  } finally {
    loading.value = false
  }
})

const filteredStudents = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return students.value
  return students.value.filter(s =>
    s.pseudonym.toLowerCase().includes(q) || s.username.toLowerCase().includes(q),
  )
})

function toggle(username: string, on: boolean) {
  const next = new Set(checked.value)
  if (on) next.add(username)
  else next.delete(username)
  checked.value = next
}

async function save() {
  if (scope.value === 'chosen' && !checked.value.size) {
    error.value = 'Выберите хотя бы одного ученика'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/courses/${props.slug}/assignments/${props.assignmentId}`, {
      method: 'PATCH',
      body: {
        status: 'published',
        type: scope.value === 'all' ? 'general' : 'private',
        audience: scope.value === 'chosen' ? [...checked.value] : [],
        groups: selectedGroups.value,
      },
    })
    emit('changed')
  } catch (e) {
    error.value = errText(e, 'Не удалось выдать задание')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseModal :title="`Выдать задание`" @close="emit('close')">

      <p class="muted" style="margin-top: 0;">{{ title }}</p>

      <p v-if="loadError" class="error">{{ loadError }}</p>
      <p v-else-if="loading" class="muted">Загрузка…</p>
      <template v-else>
        <label class="enroll-item" style="margin-bottom: 6px;">
          <input v-model="scope" type="radio" value="all">
          <span class="enroll-name">Всем ученикам курса</span>
        </label>
        <label class="enroll-item" style="margin-bottom: 10px;">
          <input v-model="scope" type="radio" value="chosen">
          <span class="enroll-name">Выбранным ученикам</span>
        </label>

        <template v-if="scope === 'chosen'">
          <p v-if="!students.length" class="muted">Список учеников недоступен или пуст.</p>
          <template v-else>
            <input
              v-model="search"
              class="modal-search"
              placeholder="Поиск по имени…"
              style="margin-bottom: 8px;"
            >
            <p v-if="!filteredStudents.length" class="muted">Никого не найдено.</p>
            <ul v-else class="enroll-list" style="max-height: min(430px, 55vh); overflow-y: auto;">
              <li v-for="s in filteredStudents" :key="s.username">
              <label class="enroll-item">
                <input
                  type="checkbox"
                  :checked="checked.has(s.username)"
                  @change="toggle(s.username, ($event.target as HTMLInputElement).checked)"
                >
                <span class="enroll-name">{{ s.pseudonym }}</span>
                <span class="enroll-login muted">{{ s.username }}</span>
              </label>
            </li>
          </ul>
        </template>
      </template>

      <div style="margin-top: 14px;">
        <GroupField v-model="selectedGroups" :slug="slug" />
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      </template>

      <template #foot>
        <button @click="emit('close')">Отмена</button>
        <button class="primary" :disabled="busy || loading" @click="save">
          {{ busy ? 'Выдача…' : 'Выдать' }}
        </button>
      </template>
  </BaseModal>
</template>
