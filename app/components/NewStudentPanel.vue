<script setup lang="ts">
import { errText } from '#shared/errors'

const props = defineProps<{ slug: string }>()
const emit = defineEmits<{ close: [], created: [password?: string] }>()

const username = ref('')
const pseudonym = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const created = await $fetch<{ generatedPassword?: string }>('/api/users', {
      method: 'POST',
      body: {
        username: username.value.trim(),
        pseudonym: pseudonym.value.trim(),
        role: 'student',
      },
    })
    await $fetch(`/api/courses/${props.slug}/roster`, {
      method: 'POST',
      body: { username: username.value.trim().toLowerCase(), action: 'add' },
    })
    emit('created', created.generatedPassword)
  } catch (e) {
    error.value = errText(e, 'Не удалось создать ученика')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SidePanel title="Новый ученик" @close="emit('close')">

      <p class="muted">
        Аккаунт будет создан и сразу зачислен на курс; пароль покажем один раз —
        передайте его лично.
      </p>

      <form class="form" @submit.prevent="submit">
        <label>
          Логин
          <input v-model="username" autocomplete="off" placeholder="например ezhik-7" required>
        </label>
        <label>
          Псевдоним
          <input v-model="pseudonym" placeholder="например Ёжик-7" required>
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" :disabled="busy || !username || !pseudonym">
          {{ busy ? 'Создание…' : 'Создать и зачислить' }}
        </button>
      </form>
  </SidePanel>
</template>
