<script setup lang="ts">
const { data } = await useFetch('/api/auth/me')

if (!data.value?.user) {
  await navigateTo('/login', { replace: true })
}

const user = computed(() => data.value?.user ?? null)

const roleHint: Record<string, string> = {
  admin: 'Управление аккаунтами — в разделе «Пользователи». Курсы появятся на следующем шаге.',
  teacher: 'Курсы и домашние задания появятся на следующем шаге.',
  student: 'Материалы и домашние задания появятся на следующем шаге.',
}
</script>

<template>
  <div v-if="user">
    <div class="card">
      <h1>Здравствуйте, {{ user.pseudonym }}</h1>
      <p class="muted">{{ roleHint[user.role] }}</p>
      <p v-if="user.role === 'admin'">
        <NuxtLink to="/admin/users">Управление пользователями →</NuxtLink>
      </p>
    </div>
  </div>
</template>
