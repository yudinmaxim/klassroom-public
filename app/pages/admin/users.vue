<script setup lang="ts">
import type { UserPublic } from '#shared/types'
import { errText } from '#shared/errors'

const { data, refresh } = await useFetch('/api/users')
const { data: rolesData } = await useFetch('/api/roles')

const users = computed(() => data.value?.users ?? [])
const roles = computed(() => rolesData.value?.roles ?? [])
const roleTitle = (name: string) => roles.value.find(r => r.name === name)?.title ?? name

const form = reactive({ username: '', pseudonym: '', role: 'student' })
const error = ref('')
const busy = ref(false)

// пароль показывается один раз, сразу после создания/сброса
const revealedSecret = ref('')

async function createUser() {
  error.value = ''
  busy.value = true
  try {
    const res = await $fetch<{ user: UserPublic, generatedPassword?: string }>(
      '/api/users',
      { method: 'POST', body: form },
    )
    if (res.generatedPassword) revealedSecret.value = res.generatedPassword
    form.username = ''
    form.pseudonym = ''
    await refresh()
  } catch (e) {
    error.value = errText(e, 'Не удалось создать пользователя')
  } finally {
    busy.value = false
  }
}

const resetting = ref<string | null>(null)

async function resetPassword(u: UserPublic) {
  error.value = ''
  resetting.value = u.username
  try {
    const res = await $fetch<{ generatedPassword?: string }>(
      `/api/users/${u.username}/password`,
      { method: 'POST' },
    )
    if (res.generatedPassword) revealedSecret.value = res.generatedPassword
    await refresh()
  } catch (e) {
    error.value = errText(e, 'Не удалось сбросить пароль')
  } finally {
    resetting.value = null
  }
}

async function copySecret() {
  await navigator.clipboard.writeText(revealedSecret.value)
}
</script>

<template>
  <div>
    <h1>Пользователи</h1>

    <div v-if="revealedSecret" class="card">
      <h2>Пароль передан один раз — запишите его сейчас</h2>
      <div class="secret">{{ revealedSecret }}</div>
      <p class="row" style="margin-top: 10px;">
        <button class="small" @click="copySecret">Скопировать</button>
        <button class="small" @click="revealedSecret = ''">Скрыть</button>
      </p>
    </div>

    <div class="card">
      <h2>Создать аккаунт</h2>
      <form class="form" @submit.prevent="createUser">
        <div class="row" style="gap: 12px; flex-wrap: wrap;">
          <label style="flex: 1; min-width: 140px;">
            Логин
            <input v-model="form.username" autocomplete="off" required>
          </label>
          <label style="flex: 2; min-width: 180px;">
            Псевдоним
            <input v-model="form.pseudonym" required>
          </label>
          <label style="min-width: 130px;">
            Роль
            <select v-model="form.role">
              <option v-for="r in roles" :key="r.name" :value="r.name">{{ r.title }}</option>
            </select>
          </label>
        </div>
        <p class="muted">
          Пароль сгенерируется автоматически (вид «lisa-luna-42») и будет показан один раз.
        </p>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" :disabled="busy">Создать</button>
      </form>
    </div>

    <div class="card">
      <h2>Все аккаунты</h2>
      <table>
        <thead>
          <tr>
            <th>Логин</th>
            <th>Псевдоним</th>
            <th>Роль</th>
            <th>Создан</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.username">
            <td>{{ u.username }}</td>
            <td><strong>{{ u.pseudonym }}</strong></td>
            <td>{{ roleTitle(u.role) }}</td>
            <td class="muted">{{ new Date(u.createdAt).toLocaleDateString('ru-RU') }}</td>
            <td>
              <button class="small" :disabled="resetting === u.username" @click="resetPassword(u)">
                {{ resetting === u.username ? 'Сброс...' : 'Сбросить пароль' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!users.length" class="muted">Аккаунтов пока нет.</p>
    </div>
  </div>
</template>
