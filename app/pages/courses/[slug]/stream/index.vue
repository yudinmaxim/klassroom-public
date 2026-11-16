<script setup lang="ts">
import type { StreamPost } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'
import { onNotification } from '~/composables/useNotifications'

const { data: coursePageData } = useCourseContext()
const course = computed(() => coursePageData.value?.course ?? null)

const posts = ref<StreamPost[]>([])
const error = ref('')
const text = ref('')
const busy = ref(false)

async function load() {
  if (!course.value) return
  try {
    posts.value = await $fetch<StreamPost[]>(`/api/courses/${course.value.slug}/stream`)
  } catch (e) {
    error.value = errText(e, 'Не удалось загрузить ленту')
  }
}
onMounted(load)

// live-обновление: новый пост в ленте этого курса
onMounted(() => onNotification((n) => {
  if (n.type === 'stream.posted' && n.course === course.value?.slug) void load()
}))

async function send() {
  if (!course.value || !text.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/courses/${course.value.slug}/stream`, {
      method: 'POST',
      body: { text: text.value },
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
  <div class="course-page">
    <div class="course-content">
      <div class="card">
        <h2 style="margin-top: 0;">Лента курса</h2>
        <p class="muted" style="margin-top: 0;">
          Объявления и обсуждения для всех участников курса (markdown).
        </p>

        <div class="row" style="gap: 8px; align-items: flex-end; margin-bottom: 14px;">
          <textarea
            v-model="text"
            rows="2"
            placeholder="Сообщение для курса…"
            style="flex: 1;"
          />
          <button class="primary" :disabled="busy || !text.trim()" @click="send">
            {{ busy ? '…' : 'Отправить' }}
          </button>
        </div>
        <p v-if="error" class="error">{{ error }}</p>

        <p v-if="!posts.length" class="muted">Пока тихо — первый пост за вами.</p>
        <div
          v-for="p in posts"
          :key="p.id"
          class="card"
          style="margin-bottom: 10px; padding: 12px 14px;"
        >
          <p class="muted" style="margin: 0 0 6px; font-size: 12px;">
            {{ p.author }} · {{ new Date(p.createdAt).toLocaleString('ru') }}
          </p>
          <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере -->
          <div class="md-body" v-html="p.html" />
        </div>
      </div>
    </div>
  </div>
</template>
