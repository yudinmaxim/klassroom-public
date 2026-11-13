<script setup lang="ts">
import { errText } from '#shared/errors'

const props = defineProps<{
  slug: string
  assignmentSlug: string
  title: string
  students: Array<{ username: string, pseudonym: string }>
}>()
const emit = defineEmits<{ close: [], changed: [] }>()

const checked = ref<Set<string>>(new Set())
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    const res = await $fetch<{ assignment: { audience: string[] } }>(
      `/api/courses/${props.slug}/assignments/${props.assignmentSlug}`,
    )
    checked.value = new Set(res.assignment.audience)
  } catch (e) {
    loadError.value = errText(e, 'Не удалось загрузить задание')
  } finally {
    loading.value = false
  }
})

function toggle(username: string, on: boolean) {
  const next = new Set(checked.value)
  if (on) next.add(username)
  else next.delete(username)
  checked.value = next
}

async function save() {
  if (!checked.value.size) {
    error.value = 'Выберите хотя бы одного ученика'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/courses/${props.slug}/assignments/${props.assignmentSlug}`, {
      method: 'PATCH',
      body: { status: 'published', audience: [...checked.value] },
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
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2>Выдать задание</h2>
        <button class="icon-btn" aria-label="Закрыть" @click="emit('close')">
          <Icon name="lucide:x" />
        </button>
      </div>

      <p class="muted" style="margin-top: 0;">{{ title }} — выберите учеников:</p>

      <p v-if="loadError" class="error">{{ loadError }}</p>
      <p v-else-if="loading" class="muted">Загрузка…</p>
      <p v-else-if="!students.length" class="muted">В курсе пока нет учеников.</p>

      <ul v-else class="enroll-list">
        <li v-for="s in students" :key="s.username">
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

      <p v-if="error" class="error">{{ error }}</p>

      <div class="modal-foot">
        <button @click="emit('close')">Отмена</button>
        <button class="primary" :disabled="busy || loading" @click="save">
          {{ busy ? 'Выдача…' : 'Выдать' }}
        </button>
      </div>
    </div>
  </div>
</template>
