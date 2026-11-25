<script setup lang="ts">
import type { UserPublic } from '#shared/types'
import { errText } from '#shared/errors'
import { copyText } from '~/utils/clipboard'
import QRCode from 'qrcode'

const { data: rolesData } = await useFetch('/api/roles')

useBreadcrumbs().value = [{ label: 'Курсы', to: '/' }, { label: 'Пользователи' }]

interface MembershipEntry { slug: string, title: string, groups: string[] }
interface UsersResponse {
  users: UserPublic[]
  total: number
  page: number
  pageSize: number
  memberships: Record<string, MembershipEntry[]>
  options: { courses: Array<{ slug: string, title: string }>, groups: string[] }
}

// --- список с серверными фильтрами и пагинацией ---
const users = ref<UserPublic[]>([])
const total = ref(0)
const memberships = ref<Record<string, MembershipEntry[]>>({})
const options = ref<UsersResponse['options']>({ courses: [], groups: [] })
const page = ref(1)
const pageSize = ref(20)
const listLoading = ref(false)
const listError = ref('')

const filterQuery = ref('')
const filterRole = ref('')
const filterCourse = ref('')
const filterGroup = ref('')

async function loadUsers() {
  listLoading.value = true
  listError.value = ''
  try {
    const params = new URLSearchParams()
    if (filterQuery.value.trim()) params.set('q', filterQuery.value.trim())
    if (filterRole.value) params.set('role', filterRole.value)
    if (filterCourse.value) params.set('course', filterCourse.value)
    if (filterGroup.value) params.set('group', filterGroup.value)
    params.set('page', String(page.value))
    params.set('pageSize', String(pageSize.value))
    const res = await $fetch<UsersResponse>(`/api/users?${params}`)
    users.value = res.users
    total.value = res.total
    memberships.value = res.memberships
    options.value = res.options
  } catch (e) {
    listError.value = errText(e, 'Не удалось загрузить пользователей')
  } finally {
    listLoading.value = false
  }
}

const hasFilters = computed(() =>
  Boolean(filterQuery.value.trim() || filterRole.value || filterCourse.value || filterGroup.value),
)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

/** Номера страниц для пагинации: [1,2,…,X,…,last] с пропуском середин. */
const pageNumbers = computed<(number | '…')[]>(() => {
  const n = totalPages.value
  const cur = page.value
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1)
  const set = new Set([1, 2, n - 1, n, cur - 1, cur, cur + 1])
  const sorted = [...set].filter(x => x >= 1 && x <= n).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  let prev = 0
  for (const x of sorted) {
    if (x - prev > 1) out.push('…')
    out.push(x)
    prev = x
  }
  return out
})

// дебаунс на изменения фильтров → страница 1 + перезагрузка
let filterTimer: ReturnType<typeof setTimeout> | undefined
watch([filterQuery, filterRole, filterCourse, filterGroup], () => {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => {
    page.value = 1
    void loadUsers()
  }, 300)
})

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  void loadUsers()
}
function setPageSize(n: number) {
  pageSize.value = n
  page.value = 1
  void loadUsers()
}

onMounted(() => { void loadUsers() })

const roles = computed(() => rolesData.value?.roles ?? [])
const roleTitle = (name: string) => roles.value.find(r => r.name === name)?.title ?? name

/** Уникальные названия групп пользователя по всем курсам (в пределах страницы). */
function groupTitles(username: string): string[] {
  const titles = (memberships.value[username] ?? []).flatMap(m => m.groups)
  return [...new Set(titles)]
}

const error = ref('')

// пароль показывается один раз, сразу после создания/сброса
const revealedSecret = ref('')

// индикация «скопировано» на кнопке копирования QR-ссылки
const copiedQr = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
function flashCopied() {
  copiedQr.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copiedQr.value = false }, 1500)
}

// undefined — панель закрыта, null — создание, объект — редактирование
const panelUser = ref<UserPublic | null | undefined>(undefined)

function onSaved(generatedPassword?: string) {
  if (generatedPassword) revealedSecret.value = generatedPassword
  panelUser.value = undefined
  void loadUsers()
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
  if (await copyText(qrUrl.value)) flashCopied()
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


</script>

<template>
  <PageShell>
    <template #title>Пользователи</template>
    <template #actions>
      <IconBtn icon="lucide:plus" label="Создать аккаунт" @click="panelUser = null" />
    </template>

    <SecretReveal v-if="revealedSecret" :secret="revealedSecret" @hide="revealedSecret = ''" />

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
      <div class="row" style="gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
        <input
          v-model="filterQuery"
          placeholder="Логин или имя…"
          style="max-width: 220px;"
        >
        <select v-model="filterRole" style="max-width: 160px;">
          <option value="">Все роли</option>
          <option v-for="r in roles" :key="r.name" :value="r.name">{{ r.title }}</option>
        </select>
        <select v-model="filterCourse" style="max-width: 220px;">
          <option value="">Все курсы</option>
          <option v-for="c in options.courses" :key="c.slug" :value="c.slug">{{ c.title }}</option>
        </select>
        <select v-model="filterGroup" style="max-width: 180px;">
          <option value="">Все группы</option>
          <option v-for="g in options.groups" :key="g" :value="g">{{ g }}</option>
        </select>
        <button
          v-if="hasFilters"
          class="small"
          @click="filterQuery = ''; filterRole = ''; filterCourse = ''; filterGroup = ''"
        >
          Сбросить
        </button>
      </div>
      <p v-if="listLoading" class="muted">Загрузка…</p>
      <p v-else-if="listError" class="error">{{ listError }}</p>
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
              <IconBtn icon="lucide:pencil" label="Редактировать" @click="panelUser = u" />
              <IconBtn
                icon="lucide:key-round"
                label="Сбросить пароль"
                :disabled="resetting === u.username"
                @click="resetTarget = u; qrUser = null"
              />
              <IconBtn
                icon="lucide:qr-code"
                label="QR-вход"
                @click="qrUser = u; resetTarget = null; qrImage = ''; qrUrl = ''; qrToken = ''; qrBases = []; qrBase = ''"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!listLoading && !users.length" class="muted">
        {{ hasFilters ? 'Никого не найдено по фильтрам.' : 'Аккаунтов пока нет.' }}
      </p>

      <div v-if="total > 0" class="row" style="gap: 10px; align-items: center; margin-top: 12px; flex-wrap: wrap;">
        <span class="muted" style="font-size: 12px;">
          {{ total }} акк. · стр. {{ page }} из {{ totalPages }}
        </span>
        <div class="spacer" />
        <select
          v-if="totalPages > 1"
          :value="pageSize"
          style="width: auto;"
          @change="setPageSize(Number(($event.target as HTMLSelectElement).value))"
        >
          <option :value="10">10 / стр.</option>
          <option :value="20">20 / стр.</option>
          <option :value="50">50 / стр.</option>
        </select>
        <span class="pager">
          <button class="small" :disabled="page <= 1 || listLoading" @click="goToPage(page - 1)">←</button>
          <template v-for="(p, i) in pageNumbers" :key="i">
            <span v-if="p === '…'" class="pager-dots">…</span>
            <button
              v-else
              class="small pager-num"
              :class="{ active: p === page }"
              :disabled="listLoading"
              @click="goToPage(p)"
            >{{ p }}</button>
          </template>
          <button class="small" :disabled="page >= totalPages || listLoading" @click="goToPage(page + 1)">→</button>
        </span>
      </div>
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
.pager { display: inline-flex; gap: 4px; align-items: center; }
.pager-num.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.pager-dots { padding: 0 2px; color: var(--muted); }
</style>
