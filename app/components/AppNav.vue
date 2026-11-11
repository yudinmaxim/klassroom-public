<script setup lang="ts">
const route = useRoute()
const { data } = useFetch('/api/auth/me', { key: 'me' })
const user = computed(() => data.value?.user ?? null)

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await refreshNuxtData('me')
  await navigateTo('/login')
}

const isAdminArea = computed(() => route.path.startsWith('/admin'))
</script>

<template>
  <header class="topbar">
    <div class="topbar-inner">
      <NuxtLink to="/" class="brand">wikiroom</NuxtLink>
      <NuxtLink v-if="user?.role === 'admin' && !isAdminArea" to="/admin/users" class="nav-link">
        Пользователи
      </NuxtLink>
      <NuxtLink v-if="user?.role === 'admin' && isAdminArea" to="/" class="nav-link">
        ← На главную
      </NuxtLink>
      <div class="spacer" />
      <template v-if="user">
        <span class="muted">{{ user.pseudonym }}</span>
        <span class="muted">·</span>
        <span class="muted">{{ user.role }}</span>
        <button class="small" @click="logout">Выйти</button>
      </template>
    </div>
  </header>
</template>
