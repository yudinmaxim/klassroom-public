<script setup lang="ts">
import { errText } from '#shared/errors'

const props = defineProps<{ slug: string, enrolled: string[] }>()
const emit = defineEmits<{ close: [], changed: [] }>()

interface Candidate { username: string, pseudonym: string }

const candidates = ref<Candidate[]>([])
const loading = ref(true)
const loadError = ref('')
const search = ref('')
const checked = ref<Set<string>>(new Set(props.enrolled))
const busy = ref(false)
const error = ref('')

const enrolledSet = computed(() => new Set(props.enrolled))

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return candidates.value
  return candidates.value.filter(c =>
    c.pseudonym.toLowerCase().includes(q) || c.username.toLowerCase().includes(q),
  )
})

function toggle(username: string, on: boolean) {
  const next = new Set(checked.value)
  if (on) next.add(username)
  else next.delete(username)
  checked.value = next
}

onMounted(async () => {
  try {
    const res = await $fetch<{ students: Candidate[] }>(
      `/api/courses/${props.slug}/roster-candidates`,
    )
    candidates.value = res.students
  } catch (e) {
    loadError.value = errText(e, 'Не удалось загрузить список учеников')
  } finally {
    loading.value = false
  }
})

async function save() {
  busy.value = true
  error.value = ''
  try {
    const toAdd = [...checked.value].filter(u => !enrolledSet.value.has(u))
    const toRemove = props.enrolled.filter(u => !checked.value.has(u))
    for (const username of toAdd) {
      await $fetch(`/api/courses/${props.slug}/roster`, {
        method: 'POST',
        body: { username, action: 'add' },
      })
    }
    for (const username of toRemove) {
      await $fetch(`/api/courses/${props.slug}/roster`, {
        method: 'POST',
        body: { username, action: 'remove' },
      })
    }
    emit('changed')
  } catch (e) {
    error.value = errText(e, 'Не удалось обновить состав курса')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseModal title="Зачисление на курс" @close="emit('close')">

      <input
        v-model="search"
        class="modal-search"
        placeholder="Поиск по имени или логину…"
        autofocus
      >

      <p v-if="loadError" class="error">{{ loadError }}</p>
      <p v-else-if="loading" class="muted">Загрузка…</p>
      <p v-else-if="!filtered.length" class="muted">Никого не найдено.</p>

      <ul v-else class="enroll-list">
        <li v-for="c in filtered" :key="c.username">
          <label class="enroll-item">
            <input
              type="checkbox"
              :checked="checked.has(c.username)"
              @change="toggle(c.username, ($event.target as HTMLInputElement).checked)"
            >
            <span class="enroll-name">{{ c.pseudonym }}</span>
            <span class="enroll-login muted">{{ c.username }}</span>
            <span v-if="enrolledSet.has(c.username)" class="enroll-badge">на курсе</span>
          </label>
        </li>
      </ul>

      <p v-if="error" class="error">{{ error }}</p>

      <template #foot>
        <button @click="emit('close')">Отмена</button>
        <button class="primary" :disabled="busy || loading" @click="save">
          {{ busy ? 'Сохранение…' : 'Сохранить' }}
        </button>
      </template>
  </BaseModal>
</template>
