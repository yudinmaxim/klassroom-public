<script setup lang="ts">
import type { CourseSummary, StreamFeedPost } from '#shared/types'
import { errText } from '#shared/errors'
import { useBreadcrumbs } from '~/composables/useBreadcrumbs'
import { onNotification } from '~/composables/useNotifications'

const crumbs = useBreadcrumbs()
crumbs.value = [{ label: 'Лента' }]

const { data: me } = await useFetch('/api/auth/me', { key: 'me' })
if (!me.value?.user) await navigateTo('/login', { replace: true })

const posts = ref<StreamFeedPost[]>([])
const courses = ref<CourseSummary[]>([])
const error = ref('')
const text = ref('')
const courseSlug = ref('')
const busy = ref(false)

async function load() {
  try {
    posts.value = await $fetch<StreamFeedPost[]>('/api/stream')
  } catch (e) {
    error.value = errText(e, 'Не удалось загрузить ленту')
  }
}
async function loadCourses() {
  try {
    const res = await $fetch<{ courses: CourseSummary[] }>('/api/courses')
    courses.value = res.courses
    if (!courseSlug.value && courses.value.length) courseSlug.value = courses.value[0]!.slug
  } catch { /* нет курсов — форма скрыта */ }
}
onMounted(() => {
  void load()
  void loadCourses()
})

// live-обновление: новый пост в любом доступном курсе
onMounted(() => onNotification((n) => {
  if (n.type === 'stream.posted') void load()
}))

async function send() {
  if (!courseSlug.value || !text.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/stream', {
      method: 'POST',
      body: { course: courseSlug.value, text: text.value },
    })
    text.value = ''
    await load()
  } catch (e) {
    error.value = errText(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 16px;">
      <h1 style="margin: 0;">Лента</h1>
    </div>

    <div v-if="courses.length" class="card" style="margin-bottom: 14px;">
      <div class="row" style="gap: 8px; align-items: flex-end;">
        <label style="flex: 0 0 220px;">
          Курс
          <select v-model="courseSlug">
            <option v-for="c in courses" :key="c.slug" :value="c.slug">{{ c.title }}</option>
          </select>
        </label>
        <textarea
          v-model="text"
          rows="2"
          placeholder="Сообщение…"
          style="flex: 1;"
        />
        <button class="primary" :disabled="busy || !text.trim()" @click="send">
          {{ busy ? '…' : 'Отправить' }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
    <p v-else class="muted">Нет доступных курсов — <NuxtLink to="/">выберите курс</NuxtLink>.</p>

    <p v-if="error && !courses.length" class="error">{{ error }}</p>
    <p v-if="!posts.length && courses.length" class="muted">Пока тихо — первый пост за вами.</p>

    <div
      v-for="p in posts"
      :key="`${p.course}/${p.id}`"
      class="card"
      style="margin-bottom: 10px; padding: 12px 14px;"
    >
      <p class="muted" style="margin: 0 0 4px; font-size: 12px;">
        <NuxtLink :to="`/courses/${p.course}`">{{ p.courseTitle }}</NuxtLink>
        · {{ p.author }} · {{ new Date(p.createdAt).toLocaleString('ru') }}
      </p>
      <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере -->
      <div class="md-body" v-html="p.html" />
    </div>
  </div>
</template>
