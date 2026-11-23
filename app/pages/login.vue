<script setup lang="ts">
import { errText } from '#shared/errors'

const { data: setupInfo } = await useFetch('/api/setup')
const setupAvailable = computed(() => setupInfo.value?.available ?? false)

useBreadcrumbs().value = []

const form = reactive({ username: '', password: '' })
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: form })
    await refreshNuxtData('me')
    await navigateTo('/')
  } catch (e) {
    error.value = errText(e, 'Не удалось войти')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-block">
    <img src="/login-logo.jpeg" alt="Классная комната" class="auth-logo">
    <div class="card" style="max-width: 420px; width: 100%; margin: 0 auto;">
      <h1 style="text-align: center;">Вход</h1>
      <form class="form" @submit.prevent="submit">
        <label>
          Логин
          <input v-model="form.username" autocomplete="username" required>
        </label>
        <label>
          Пароль
          <input v-model="form.password" type="password" autocomplete="current-password" required>
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" :disabled="busy">Войти</button>
      </form>
      <p v-if="setupAvailable" class="muted" style="margin-top: 16px;">
        Первый запуск?
        <NuxtLink to="/setup">Создайте администратора →</NuxtLink>
      </p>
    </div>
  </div>
</template>
