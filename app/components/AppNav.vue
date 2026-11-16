<script setup lang="ts">
import type { UserPublic } from '#shared/types'
const route = useRoute()
const crumbs = useBreadcrumbs()

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
  <div class="shell">
    <aside class="sidebar">
      <NuxtLink to="/" class="brand">wikiroom</NuxtLink>
      <nav v-if="user" class="side-nav">
        <NuxtLink to="/stream" class="nav-link" :class="{ active: isActive('/stream') }">Лента</NuxtLink>
        <NuxtLink to="/grades" class="nav-link" :class="{ active: isActive('/grades') }">Оценки</NuxtLink>
        <NuxtLink to="/" class="nav-link" :class="{ active: isActive('/') }">Курсы</NuxtLink>
        <template v-if="user.role === 'admin'">
          <NuxtLink
            to="/admin/users"
            class="nav-link"
            :class="{ active: isActive('/admin/users') }"
          >
            Пользователи
          </NuxtLink>
          <NuxtLink
            to="/admin/roles"
            class="nav-link"
            :class="{ active: isActive('/admin/roles') }"
          >
            Роли
          </NuxtLink>
        </template>
      </nav>
      <div v-if="user" class="sidebar-foot">
        <span class="user-name">{{ user.pseudonym }}</span>
        <span class="tip tip-up">
          <button class="icon-btn" aria-label="Выйти" @click="logout">
            <Icon name="lucide:log-out" />
          </button>
          <span class="tip-body">Выйти</span>
        </span>
      </div>
    </aside>

    <div class="main-col">
      <header v-if="crumbs.length" class="topbar">
        <nav v-if="crumbs.length" class="crumbs" aria-label="Хлебные крошки">
          <template v-for="(c, i) in crumbs" :key="i">
            <NuxtLink v-if="c.to" :to="c.to" class="crumb">{{ c.label }}</NuxtLink>
            <span v-else class="crumb current">{{ c.label }}</span>
            <span v-if="i < crumbs.length - 1" class="crumb-sep">/</span>
          </template>
        </nav>
      </header>
      <main class="container">
        <slot />
      </main>
    </div>
    <NotificationToasts />
  </div>
</template>
