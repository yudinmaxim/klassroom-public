<script setup lang="ts">
import type { UserPublic } from '#shared/types'
import { errText } from '#shared/errors'
import QRCode from 'qrcode'

const { data, refresh } = await useFetch('/api/users')
const { data: rolesData } = await useFetch('/api/roles')

useBreadcrumbs().value = [{ label: 'Курсы', to: '/' }, { label: 'Пользователи' }]

const users = computed(() => data.value?.users ?? [])
const roles = computed(() => rolesData.value?.roles ?? [])
const roleTitle = (name: string) => roles.value.find(r => r.name === name)?.title ?? name

const error = ref('')

// пароль показывается один раз, сразу после создания/сброса
const revealedSecret = ref('')

// undefined — панель закрыта, null — создание, объект — редактирование
const panelUser = ref<UserPublic | null | undefined>(undefined)

function onSaved(generatedPassword?: string) {
  if (generatedPassword) revealedSecret.value = generatedPassword
  panelUser.value = undefined
  void refresh()
}

const resetting = ref<string | null>(null)
const resetTarget = ref<UserPublic | null>(null)

async function confirmResetPassword() {
  const u = resetTarget.value
  resetTarget.value = null
  if (!u) return
  error.value = ''
  resetting.value = u.username
  try {
    const res = await $fetch<{ generatedPassword?: string }>(
      `/api/users/${u.username}/password`,
      { method: 'POST', body: {} },
    )
    if (res.generatedPassword) revealedSecret.value = res.generatedPassword
    await refresh()
  } catch (e) {
    error.value = errText(e, 'Не удалось сбросить пароль')
  } finally {
    resetting.value = null
  }
}

// --- QR-вход ---
const qrUser = ref<UserPublic | null>(null)
const qrTtl = ref<'class' | 'home'>('class')
const qrImage = ref('')
const qrUrl = ref('')
const qrExpires = ref('')
const qrError = ref('')
const qrBusy = ref(false)

async function copyQrUrl() {
  try {
    await navigator.clipboard.writeText(qrUrl.value)
  } catch {
    // буфер обмена недоступен (например, без https) — ссылка и так видна на экране
  }
}

function closeQr() {
  qrUser.value = null
  qrImage.value = ''
  qrUrl.value = ''
}
async function generateQr() {
  if (!qrUser.value) return
  qrError.value = ''
  qrBusy.value = true
  try {
    const res = await $fetch<{ token: string, expiresAt: string }>(
      `/api/users/${qrUser.value.username}/qr`,
      { method: 'POST', body: { ttl: qrTtl.value } },
    )
    qrUrl.value = `${window.location.origin}/login/qr?t=${res.token}`
    qrImage.value = await QRCode.toDataURL(qrUrl.value, { width: 240, margin: 1 })
    qrExpires.value = new Date(res.expiresAt).toLocaleString('ru-RU')
  } catch (e) {
    qrError.value = errText(e, 'Не удалось создать QR-код')
  } finally {
    qrBusy.value = false
  }
}

async function copySecret() {
  await navigator.clipboard.writeText(revealedSecret.value)
}
</script>

<template>
  <PageShell>
    <template #title>Пользователи</template>
    <template #actions>
      <button class="icon-btn" aria-label="Создать аккаунт" @click="panelUser = null">
        <Icon name="lucide:plus" />
      </button>
    </template>

    <div v-if="revealedSecret" class="card">
      <h2>Пароль передан один раз — запишите его сейчас</h2>
      <div class="secret">{{ revealedSecret }}</div>
      <p class="row" style="margin-top: 10px;">
        <button class="small" @click="copySecret">Скопировать</button>
        <button class="small" @click="revealedSecret = ''">Скрыть</button>
      </p>
    </div>

    <div v-if="qrUser" class="card">
      <div class="row">
        <h2 style="margin: 0;">QR-вход для {{ qrUser.pseudonym }}</h2>
        <div class="spacer" />
        <button class="small" @click="closeQr">Закрыть</button>
      </div>
      <p class="muted">
        Одноразовая ссылка для входа без пароля. Ученик сканирует QR камерой телефона —
        и сразу попадает в свой аккаунт. Новая генерация отменяет прежнюю ссылку.
      </p>
      <div class="row" style="gap: 12px; flex-wrap: wrap;">
        <label style="min-width: 220px;">
          Срок действия
          <select v-model="qrTtl" @change="qrImage = ''">
            <option value="class">15 минут (раздать в классе)</option>
            <option value="home">7 дней (ссылка на дом)</option>
          </select>
        </label>
        <button class="primary" :disabled="qrBusy" @click="generateQr">Создать QR</button>
      </div>
      <p v-if="qrError" class="error" style="margin-top: 10px;">{{ qrError }}</p>
      <div v-if="qrImage" style="margin-top: 14px;">
        <img :src="qrImage" alt="QR-код входа" style="border: 1px solid var(--line); border-radius: 8px;">
        <p class="muted" style="margin: 8px 0 0;">Действует до {{ qrExpires }} · одноразовый</p>
        <p class="muted" style="word-break: break-all; margin: 4px 0 0;">{{ qrUrl }}</p>
        <button class="small" @click="copyQrUrl">
          Скопировать ссылку
        </button>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="card">
      <h2>Все аккаунты</h2>
      <table class="data-table">
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
            <td class="row-actions">
              <span class="tip">
                <button class="icon-btn" aria-label="Редактировать аккаунт" @click="panelUser = u">
                  <Icon name="lucide:pencil" />
                </button>
                <span class="tip-body">Редактировать</span>
              </span>
              <span class="tip">
                <button
                  class="icon-btn"
                  aria-label="Сбросить пароль"
                  :disabled="resetting === u.username"
                  @click="resetTarget = u"
                >
                  <Icon name="lucide:key-round" />
                </button>
                <span class="tip-body">Сбросить пароль</span>
              </span>
              <span class="tip">
                <button
                  class="icon-btn"
                  aria-label="QR-вход"
                  @click="qrUser = u; qrImage = ''; qrUrl = ''"
                >
                  <Icon name="lucide:qr-code" />
                </button>
                <span class="tip-body">QR-вход</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!users.length" class="muted">Аккаунтов пока нет.</p>
    </div>

    <UserPanel
      v-if="panelUser !== undefined"
      :user="panelUser"
      :roles="roles"
      @close="panelUser = undefined"
      @saved="onSaved"
    />

    <ConfirmModal
      v-if="resetTarget"
      title="Сбросить пароль?"
      :message="`Пароль пользователя «${resetTarget.pseudonym}» будет сброшен, все его активные сессии завершатся. Новый пароль показывается один раз.`"
      confirm-label="Сбросить пароль"
      danger
      @confirm="confirmResetPassword"
      @cancel="resetTarget = null"
    />
  </PageShell>
</template>
