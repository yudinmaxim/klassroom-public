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

// auth-страницы (вход, первый запуск, QR) — без сайдбара и топбара
const bare = computed(() =>
  ['/login', '/setup'].some(p => route.path === p || route.path.startsWith(`${p}/`)),
)

const profileOpen = ref(false)
const initials = computed(() =>
  (user.value?.pseudonym ?? '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(),
)
const roleLabel = computed(() => ({
  admin: 'Администратор',
  teacher: 'Учитель',
  student: 'Ученик',
} as Record<string, string>)[user.value?.role ?? ''] ?? '')
</script>

<template>
  <main v-if="bare" class="auth-main">
    <slot />
    <NotificationToasts />
  </main>
  <div v-else class="shell">
    <aside class="sidebar">
      <NuxtLink to="/" class="brand">
        <img src="/logo.png" alt="Классная комната" class="brand-img">
      </NuxtLink>
      <nav v-if="user" class="side-nav">
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
        <span class="avatar" aria-hidden="true">{{ initials }}</span>
        <div class="sidebar-user">
          <span class="user-name">{{ user.pseudonym }}</span>
          <span class="user-role">{{ roleLabel }}</span>
        </div>
        <span class="tip tip-up">
          <button class="icon-btn" aria-label="Выйти" @click="logout">
            <Icon name="lucide:log-out" />
          </button>
          <span class="tip-body">Выйти</span>
        </span>
      </div>
    </aside>

    <div class="main-col">
      <header class="topbar">
        <nav v-if="crumbs.length" class="crumbs" aria-label="Хлебные крошки">
          <template v-for="(c, i) in crumbs" :key="i">
            <NuxtLink v-if="c.to" :to="c.to" class="crumb">{{ c.label }}</NuxtLink>
            <span v-else class="crumb current">{{ c.label }}</span>
            <span v-if="i < crumbs.length - 1" class="crumb-sep">/</span>
          </template>
        </nav>
        <div class="spacer" />
        <div v-if="user" class="dropdown">
          <button
            class="profile-btn"
            aria-haspopup="menu"
            :aria-expanded="profileOpen"
            @click="profileOpen = !profileOpen"
          >
            <span class="avatar avatar-sm" aria-hidden="true">{{ initials }}</span>
            <span class="profile-name">{{ user.pseudonym }}</span>
            <Icon name="lucide:chevron-down" class="profile-caret" />
          </button>
          <div v-if="profileOpen" class="dropdown-backdrop" @click="profileOpen = false" />
          <div v-if="profileOpen" class="dropdown-menu profile-menu" role="menu">
            <div class="profile-menu-head">
              <span class="avatar" aria-hidden="true">{{ initials }}</span>
              <div>
                <div class="profile-menu-name">{{ user.pseudonym }}</div>
                <div class="profile-menu-role">{{ roleLabel }}</div>
              </div>
            </div>
            <button role="menuitem" @click="logout">Выйти</button>
          </div>
        </div>
      </header>
      <main class="container">
        <slot />
      </main>
    </div>
    <NotificationToasts />
  </div>
</template>
