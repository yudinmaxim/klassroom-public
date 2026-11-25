<script setup lang="ts">
import { errText } from '#shared/errors'

/** Боковая панель создания курса. */
const emit = defineEmits<{
  close: []
  saved: [slug: string]
}>()

const title = ref('')
const description = ref('')
const error = ref('')
const busy = ref(false)

async function save() {
  error.value = ''
  busy.value = true
  try {
    const res = await $fetch<{ course: { slug: string } }>('/api/courses', {
      method: 'POST',
      body: { title: title.value, description: description.value },
    })
    emit('saved', res.course.slug)
  } catch (e) {
    error.value = errText(e, 'Не удалось создать курс')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SidePanel title="Новый курс" @close="emit('close')">

      <form class="form" @submit.prevent="save">
        <label>
          Название
          <input v-model="title" placeholder="Например: Геометрия 9А" required autofocus>
        </label>
        <label>
          Описание (необязательно)
          <textarea v-model="description" rows="4" />
        </label>
        <p class="muted">Адрес курса (slug) сформируется из названия автоматически.</p>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" :disabled="busy || !title.trim()">
          {{ busy ? 'Создание…' : 'Создать курс' }}
        </button>
      </form>
  </SidePanel>
</template>
