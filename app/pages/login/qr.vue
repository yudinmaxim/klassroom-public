<script setup lang="ts">
import { errText } from '#shared/errors'

const route = useRoute()
const token = computed(() => String(route.query.t ?? ''))

useBreadcrumbs().value = []

const state = ref<'pending' | 'ok' | 'gone'>('pending')
const pseudonym = ref('')

onMounted(async () => {
  if (!/^[a-f0-9]{32}$/.test(token.value)) {
    state.value = 'gone'
    return
  }
  try {
    const res = await $fetch<{ user: { pseudonym: string } }>('/api/auth/qr', {
      method: 'POST',
      body: { token: token.value },
    })
    pseudonym.value = res.user.pseudonym
    state.value = 'ok'
    await refreshNuxtData('me')
    // короткая пауза, чтобы ученик увидел подтверждение, затем на главную
    setTimeout(() => navigateTo('/'), 1500)
  } catch (e) {
    // 410 — сгоревший/просроченный токен; остальное — тоже «не получилось»
    state.value = 'gone'
    void errText(e, '')
  }
})
</script>

<template>
  <div class="auth-block">
    <img src="/login-logo.jpeg" alt="Классная комната" class="auth-logo">
    <div class="card" style="max-width: 420px; width: 100%; margin: 0 auto; text-align: center;">
      <template v-if="state === 'pending'">
        <h1>Проверяем ссылку…</h1>
        <p class="muted">Секундочку.</p>
      </template>
      <template v-else-if="state === 'ok'">
        <h1>Вход выполнен</h1>
        <p>Здравствуйте, <strong>{{ pseudonym }}</strong>! Сейчас откроем курсы…</p>
      </template>
      <template v-else>
        <h1>Ссылка недействительна</h1>
        <p class="muted">QR-ссылки одноразовые и со временем устаревают. Попросите учителя выдать новую.</p>
        <NuxtLink to="/login">Войти по логину и паролю</NuxtLink>
      </template>
    </div>
  </div>
</template>
