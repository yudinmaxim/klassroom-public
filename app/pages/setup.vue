<script setup lang="ts">
import { errText } from '#shared/errors'

const { data: setupInfo } = await useFetch('/api/setup')
const setupAvailable = computed(() => setupInfo.value?.available ?? false)

useBreadcrumbs().value = []

const form = reactive({ username: '', pseudonym: '', password: '' })
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/setup', { method: 'POST', body: form })
    await refreshNuxtData('me')
    await navigateTo('/')
  } catch (e) {
    error.value = errText(e, 'Не удалось создать администратора')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="card" style="max-width: 480px; margin: 0 auto;">
    <h1>Первый запуск</h1>
    <template v-if="setupAvailable">
      <p class="muted">Создайте администратора — он заведёт учителей и учеников.</p>
      <form class="form" @submit.prevent="submit">
        <label>
          Логин
          <input v-model="form.username" autocomplete="username" required>
        </label>
        <label>
          Псевдоним
          <input v-model="form.pseudonym" required>
        </label>
        <label>
          Пароль (минимум 8 символов)
          <input v-model="form.password" type="password" autocomplete="new-password" required>
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" :disabled="busy">Создать администратора</button>
      </form>
    </template>
    <template v-else>
      <p>Администратор уже создан.</p>
      <NuxtLink to="/login">Перейти ко входу →</NuxtLink>
    </template>
  </div>
</template>
