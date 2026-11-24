<script setup lang="ts">
import type { UserPublic } from '#shared/types'
import { errText } from '#shared/errors'
import { copyText } from '~/utils/clipboard'
import QRCode from 'qrcode'

const { data, refresh } = await useFetch('/api/users')
const { data: rolesData } = await useFetch('/api/roles')
const { data: membershipsData, refresh: refreshMemberships } = await useFetch<{ memberships: Record<string, Array<{ slug: string, title: string, groups: string[] }>> }>(
  '/api/users/memberships',
)

useBreadcrumbs().value = [{ label: 'Курсы', to: '/' }, { label: 'Пользователи' }]

const users = computed(() => data.value?.users ?? [])
const roles = computed(() => rolesData.value?.roles ?? [])
const memberships = computed(() => membershipsData.value?.memberships ?? {})
const roleTitle = (name: string) => roles.value.find(r => r.name === name)?.title ?? name

/** Уникальные названия групп пользователя по всем курсам. */
function groupTitles(username: string): string[] {
  const titles = (memberships.value[username] ?? []).flatMap(m => m.groups)
  return [...new Set(titles)]
}

const error = ref('')

// пароль показывается один раз, сразу после создания/сброса
const revealedSecret = ref('')

// индикация «скопировано» на кнопках копирования
const copiedSecret = ref(false)
const copiedQr = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
function flashCopied(which: 'secret' | 'qr') {
  if (which === 'secret') copiedSecret.value = true
  else copiedQr.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copiedSecret.value = false
    copiedQr.value = false
  }, 1500)
}

// undefined — панель закрыта, null — создание, объект — редактирование
const panelUser = ref<UserPublic | null | undefined>(undefined)

function onSaved(generatedPassword?: string) {
  if (generatedPassword) revealedSecret.value = generatedPassword
  panelUser.value = undefined
  void refresh()
  void refreshMemberships()
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
// адреса, по которым ссылку сможет открыть телефон (локалхост → LAN-IP)
const qrBases = ref<string[]>([])
const qrBase = ref('')
let qrToken = ''

async function renderQr() {
  if (!qrToken || !qrBase.value) return
  qrUrl.value = `${qrBase.value}/login/qr?t=${qrToken}`
  qrImage.value = await QRCode.toDataURL(qrUrl.value, { width: 240, margin: 1 })
}

watch(qrBase, () => { void renderQr() })

async function copyQrUrl() {
  if (await copyText(qrUrl.value)) flashCopied('qr')
}

function closeQr() {
  qrUser.value = null
  qrImage.value = ''
  qrUrl.value = ''
  qrToken = ''
  qrBases.value = []
}
async function generateQr() {
  if (!qrUser.value) return
  qrError.value = ''
  qrBusy.value = true
  try {
    const res = await $fetch<{ token: string, expiresAt: string, bases?: string[] }>(
      `/api/users/${qrUser.value.username}/qr`,
      { method: 'POST', body: { ttl: qrTtl.value } },
    )
    qrToken = res.token
    qrBases.value = res.bases?.length ? res.bases : [window.location.origin]
    // по умолчанию — не-localhost адрес; приоритет 192.168 > 10.x > 172.x > прочие
    const rank = (b: string) => {
      const ip = b.match(/\d+\.\d+\.\d+\.\d+/)?.[0] ?? ''
      if (ip.startsWith('192.168.')) return 0
      if (ip.startsWith('10.')) return 1
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2
      return ip ? 3 : 4
    }
    qrBase.value = [...qrBases.value].sort((a, b) => rank(a) - rank(b))[0]!
    await renderQr()
    qrExpires.value = new Date(res.expiresAt).toLocaleString('ru-RU')
  } catch (e) {
    qrError.value = errText(e, 'Не удалось создать QR-код')
  } finally {
    qrBusy.value = false
  }
}

async function copySecret() {
  if (await copyText(revealedSecret.value)) flashCopied('secret')
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
        <button class="small" @click="copySecret">
          {{ copiedSecret ? 'Скопировано ✓' : 'Скопировать' }}
        </button>
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
      <div class="row" style="gap: 12px; flex-wrap: wrap; align-items: flex-end;">
        <label style="min-width: 220px;">
          Срок действия
          <select v-model="qrTtl" @change="qrImage = ''">
            <option value="class">15 минут (раздать в классе)</option>
            <option value="home">7 дней (ссылка на дом)</option>
          </select>
        </label>
        <button class="primary" :disabled="qrBusy" @click="generateQr">Создать QR</button>
      </div>
      <label v-if="qrImage && qrBases.length > 1" style="margin-top: 12px; max-width: 340px;">
        Адрес для телефона
        <select v-model="qrBase">
          <option v-for="b in qrBases" :key="b" :value="b">{{ b }}</option>
        </select>
      </label>
      <p v-if="qrError" class="error" style="margin-top: 10px;">{{ qrError }}</p>
      <div v-if="qrImage" style="margin-top: 14px;">
        <img :src="qrImage" alt="QR-код входа" style="border: 1px solid var(--line); border-radius: 8px;">
        <p class="muted" style="margin: 8px 0 0;">Действует до {{ qrExpires }} · одноразовый</p>
        <p class="muted" style="word-break: break-all; margin: 4px 0 0;">{{ qrUrl }}</p>
        <button class="small" @click="copyQrUrl">
          {{ copiedQr ? 'Скопировано ✓' : 'Скопировать ссылку' }}
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
            <th>Курсы</th>
            <th>Группы</th>
            <th>Создан</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.username">
            <td>{{ u.username }}</td>
            <td><strong>{{ u.pseudonym }}</strong></td>
            <td>{{ roleTitle(u.role) }}</td>
            <td>
              <template v-if="memberships[u.username]?.length">
                <NuxtLink
                  v-for="m in memberships[u.username]"
                  :key="m.slug"
                  :to="`/courses/${m.slug}`"
                  class="member-chip course-chip"
                >{{ m.title }}</NuxtLink>
              </template>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <template v-if="groupTitles(u.username).length">
                <span
                  v-for="t in groupTitles(u.username)"
                  :key="t"
                  class="member-chip"
                >{{ t }}</span>
              </template>
              <span v-else class="muted">—</span>
            </td>
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
                  @click="resetTarget = u; qrUser = null"
                >
                  <Icon name="lucide:key-round" />
                </button>
                <span class="tip-body">Сбросить пароль</span>
              </span>
              <span class="tip">
                <button
                  class="icon-btn"
                  aria-label="QR-вход"
                  @click="qrUser = u; resetTarget = null; qrImage = ''; qrUrl = ''; qrToken = ''; qrBases = []; qrBase = ''"
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

<style scoped>
.member-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--accent-soft, rgba(79, 70, 229, 0.1));
  color: var(--accent, #4f46e5);
  margin: 0 4px 2px 0;
  white-space: nowrap;
}
.course-chip { text-decoration: none; }
.course-chip:hover { text-decoration: underline; }
</style>
