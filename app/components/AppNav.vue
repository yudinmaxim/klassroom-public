<script setup lang="ts">
import type { UserPublic } from '#shared/types'
const route = useRoute()

const { data } = useFetch('/api/auth/me', { key: 'me' })
const user = computed(() => (data.value?.user as UserPublic | null) ?? null)

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await refreshNuxtData('me')
  await navigateTo('/login')
}

const isActive = (path: string) =>
  path === '/' ? route.path === '/' || route.path.startsWith('/courses/') : route.path.startsWith(path)
</script>

<template>
  <header class="topbar">
    <div class="topbar-inner">
      <NuxtLink to="/" class="brand">wikiroom</NuxtLink>
      <template v-if="user">
        <NuxtLink to="/" class="nav-link" :class="{ active: isActive('/') }">Курсы</NuxtLink>
        <NuxtLink
          v-if="user.role === 'admin'"
          to="/admin/users"
          class="nav-link"
          :class="{ active: isActive('/admin/users') }"
        >
          Пользователи
        </NuxtLink>
        <NuxtLink
          v-if="user.role === 'admin'"
          to="/admin/roles"
          class="nav-link"
          :class="{ active: isActive('/admin/roles') }"
        >
          Роли
        </NuxtLink>
      </template>
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
